import { existsSync, watch } from "fs"
import { join, resolve } from "path"
import { pathToFileURL } from "url"
import { installCapabilities } from "../caps/index.ts"
import { App, callCapability, hasCapability, listCapabilities, loadManifest, registerCapability } from "../sdk/index.ts"
import { createStdioTransport, makeHello } from "./protocol.ts"
import { MIN_BUN, bunVersionCompatible } from "./version.ts"

installCapabilities()

const transport = createStdioTransport()

// Window control is a capability, so both the app (App.window) and QML
// (Pulsar.call) go through the same path. It reaches the host as a
// notification; there is nothing to return to the caller.
registerCapability("window", (params: unknown) => {
  send({ jsonrpc: "2.0", method: "__window", params: params ?? {} })
  return Promise.resolve(true)
})

// Dialogs run in the host (native Qt), so the runtime sends a request with a
// token and resolves the caller's promise when the host replies.
const pendingDialogs = new Map<string, (value: unknown) => void>()
let dialogToken = 0

function requestDialog(kind: string, params: unknown): Promise<unknown> {
  const token = String(++dialogToken)
  return new Promise((resolve) => {
    pendingDialogs.set(token, resolve)
    send({ jsonrpc: "2.0", method: "__dialog", params: { token, kind, ...(params as object) } })
  })
}

registerCapability("dialog.openFile", (params: unknown) => requestDialog("open", params))
registerCapability("dialog.saveFile", (params: unknown) => requestDialog("save", params))
registerCapability("dialog.message", (params: unknown) => requestDialog("message", params))

// The system tray is host-side too.
registerCapability("tray", (params: unknown) => {
  send({ jsonrpc: "2.0", method: "__tray", params: params ?? {} })
  return Promise.resolve(true)
})

// Compatibility gate: fail early with a clear message instead of letting an
// old Bun crash in obscure ways later.
const bunVersion = Bun.version ?? "0.0.0"
if (!bunVersionCompatible(bunVersion)) {
  const message = `Bun ${bunVersion} is too old; Pulsar requires Bun >= ${MIN_BUN}`
  console.error(`[pulsar] ${message}`)
  process.exit(1)
}

// stdout is reserved for the protocol. App logs go to stderr and are forwarded
// to the host so the UI can subscribe to them (see Pulsar's `log` signal).
function formatLogArg(value: unknown): string {
  if (typeof value === "string") return value
  if (value instanceof Error) return value.stack ?? value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function emitLog(level: string, args: unknown[]): void {
  const message = args.map(formatLogArg).join(" ")
  process.stderr.write(`[${level}] ${message}\n`)
  send({ jsonrpc: "2.0", method: "__log", params: { level, source: "js", message } })
}

console.log = (...args: unknown[]) => emitLog("log", args)
console.info = (...args: unknown[]) => emitLog("info", args)
console.debug = (...args: unknown[]) => emitLog("debug", args)
console.error = (...args: unknown[]) => emitLog("error", args)
console.warn = (...args: unknown[]) => emitLog("warn", args)

// Test hook: force the runtime to die so supervision can be exercised.
const testCrashMs = Number(process.env.PULSAR_TEST_CRASH_MS ?? 0)
if (testCrashMs > 0) setTimeout(() => process.exit(3), testCrashMs)

const send = (message: unknown): void => {
  transport.send(message)
}

function reportError(scope: string, e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  const stack = e instanceof Error ? e.stack : undefined
  console.error(`[pulsar] ${scope}:`, e)
  send({ jsonrpc: "2.0", method: "__error", params: { scope, message, stack } })
}

process.on("uncaughtException", (e) => reportError("uncaughtException", e))
process.on("unhandledRejection", (e) => reportError("unhandledRejection", e))

function fullState(): Record<string, unknown> {
  return App.current ? App.current.store.snapshot() : {}
}

function patchState(): { state?: Record<string, unknown>; unset?: string[] } {
  const app = App.current
  if (!app) return {}
  const { changed, removed } = app.store.takePatch()
  const out: { state?: Record<string, unknown>; unset?: string[] } = {}
  if (Object.keys(changed).length > 0) out.state = changed
  if (removed.length > 0) out.unset = removed
  return out
}

let inRequest = false
let pushScheduled = false

/** Push store changes that happen outside a request (timers, async work). */
function schedulePush() {
  if (inRequest || pushScheduled) return
  pushScheduled = true
  queueMicrotask(() => {
    pushScheduled = false
    if (inRequest) return
    const patch = patchState()
    if (patch.state || patch.unset) {
      send({ jsonrpc: "2.0", method: "__state", params: patch })
    }
  })
}

// `pulsar build` compiles runtime + app + SDK into one executable: the
// generated entry imports this module, then the app, then calls wireApp().
// From sources we instead load the app below and wire it ourselves.
const bundled = process.env.PULSAR_BUNDLED === "1"
const appDir = resolve(process.env.PULSAR_APP ?? "examples/hello")
let channelStarted = false

// The host channel starts before the app loads (so dialogs and other host
// round-trips work during startup), but __sync waits until the app is wired.
let markAppReady: () => void = () => {}
const appReady = new Promise<void>((resolve) => {
  markAppReady = resolve
})

/** Wire the loaded App to the host. Runs after the app module has evaluated. */
export function wireApp(): void {
  const app = App.current
  if (app) {
    app.store.onChange = schedulePush
    app.onQuit = () => send({ jsonrpc: "2.0", method: "__quit" })

    // Test hook: push a state value large enough to exceed the old line limit.
    const testBigItems = Number(process.env.PULSAR_TEST_BIG_ITEMS ?? 0)
    if (testBigItems > 0) {
      app.store.set(
        "big",
        Array.from({ length: testBigItems }, (_, i) => `item-${i}`),
      )
    }

    send({ jsonrpc: "2.0", method: "__config", params: { windows: app.windows } })
  }
  // The host's initial __sync can now be answered with the app's full state.
  markAppReady()
}

// Read host requests before loading the app so round-trips (e.g. dialogs) work
// during startup; __sync still waits for markAppReady().
startHostChannel()

if (!bundled) {
  // Entry comes from the manifest; a plain bundle may ship main.js instead.
  const main = loadManifest(appDir)?.main ?? "main.ts"
  const entryTs = resolve(appDir, main)
  const entry = existsSync(entryTs) ? entryTs : resolve(appDir, "main.js")
  try {
    await import(pathToFileURL(entry).href)
  } catch (e) {
    reportError("load " + entry, e)
  }
  console.error(`[pulsar] app loaded: ${appDir}`)
  wireApp()
}

// Dev hot reload: watch the app files and ask the host to restart the Bun side
// when they change. The framework source is watched too when running from the
// monorepo (coreDir == resolve(import.meta.dir, "..")).
function setupReloadWatcher() {
  if (!process.env.PULSAR_WATCH) return
  const ignored = (name: string | null) =>
    !name || name === "storage.json" || name.startsWith(".") || name.endsWith(".lock") || name.endsWith(".qml")
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      console.error(`[pulsar] change detected; reloading`)
      send({ jsonrpc: "2.0", method: "__reload" })
    }, 150)
  }
  const dirs: Array<{ path: string; recursive: boolean }> = [
    { path: appDir, recursive: false },
    { path: join(appDir, "ui"), recursive: false },
    { path: resolve(import.meta.dir, ".."), recursive: true },
  ]
  for (const d of dirs) {
    try {
      watch(d.path, { recursive: d.recursive }, (_event, filename) => {
        if (!ignored(filename)) schedule()
      })
    } catch {}
  }
}

/**
 * Start reading host requests. Deferred until after the app is loaded so the
 * initial __sync sees the app's state (a bundle loads the app after this
 * module has finished evaluating).
 */
function startHostChannel(): void {
  if (channelStarted) return
  channelStarted = true

  setupReloadWatcher()

  // The bridge owns our stdin; when it closes, the host is gone.
  transport.onClose(() => process.exit(0))
  transport.onMessage((message) => {
    void handleRequest(message)
  })

  send(makeHello(listCapabilities()))
  transport.start()
}

async function handleRequest(message: unknown): Promise<void> {
  const req = message as any

  // Notifications from the host carry no id and expect no response.
  if (req.id === undefined) {
    const params = req.params ?? {}
    if (req.method === "__log") App.current?.dispatchEvent("log", params)
    else if (req.method === "__event") App.current?.dispatchEvent(params.name, params.data ?? {})
    else if (req.method === "__dialog-result") {
      const resolve = pendingDialogs.get(String(params.token))
      if (resolve) {
        pendingDialogs.delete(String(params.token))
        resolve(params.value ?? null)
      }
    }
    return
  }

  const app = App.current

  if (req.method === "__sync") {
    await appReady
    const state = fullState()
    app?.store.takePatch()
    send({ jsonrpc: "2.0", id: req.id, result: true, state })
    return
  }

  inRequest = true
  try {
    let result: unknown = null

    if (app?.hasEvent(req.method)) {
      try {
        app.dispatchEvent(req.method, req.params ?? {})
      } catch (e) {
        reportError("event " + req.method, e)
      }
      result = true
    } else {
      if (!hasCapability(req.method)) throw new Error("method not found: " + req.method)
      result = await callCapability(req.method, req.params ?? {})
    }

    send({ jsonrpc: "2.0", id: req.id, result, ...patchState() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    send({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message: msg }, ...patchState() })
  } finally {
    inRequest = false
  }
}
