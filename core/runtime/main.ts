import { createInterface } from "node:readline"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { capabilities } from "../caps/index.ts"
import { App } from "../sdk/index.ts"

// stdout is reserved for the protocol; app logging goes to stderr.
console.log = (...args: unknown[]) => console.error(...args)
console.info = console.log
console.debug = console.log

// Test hook: force the runtime to die so supervision can be exercised.
const testCrashMs = Number(process.env.PULSAR_TEST_CRASH_MS ?? 0)
if (testCrashMs > 0) setTimeout(() => process.exit(3), testCrashMs)

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n")
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

const appDir = resolve(process.env.PULSAR_APP ?? "examples/hello")
const entry = resolve(appDir, "main.ts")

try {
  await import(pathToFileURL(entry).href)
} catch (e) {
  reportError("load " + entry, e)
}
console.error(`[pulsar] app loaded: ${appDir}`)

if (App.current) {
  const app = App.current
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

  send({ jsonrpc: "2.0", method: "__config", params: app.config })
}

const rl = createInterface({ input: process.stdin, terminal: false })

// The bridge owns our stdin; when it closes, the host is gone.
rl.on("close", () => process.exit(0))

rl.on("line", async (raw) => {
  let req: any
  try {
    req = JSON.parse(raw)
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })
    return
  }

  const app = App.current

  if (req.method === "__sync") {
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
      const cap = capabilities[req.method]
      if (!cap) throw new Error("method not found: " + req.method)
      result = await cap(req.params ?? {})
    }

    send({ jsonrpc: "2.0", id: req.id, result, ...patchState() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    send({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message: msg }, ...patchState() })
  } finally {
    inRequest = false
  }
})
