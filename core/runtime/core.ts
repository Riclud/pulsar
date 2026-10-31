import { installCapabilities } from "../caps/index.ts"
import {
  App,
  assertCapability,
  callCapability,
  createPermissionGate,
  dispatchUiEvent,
  hasCapability,
  listCapabilities,
  parseLaunchArgs,
  registerCapability,
  setManifest,
  setPermissionGate,
  type AppManifest,
} from "../sdk/index.ts"
import { net, netInternals } from "../sdk/net.ts"
import type { Platform } from "../platform.ts"
import { buildHello, type RuntimeInfo, type Transport } from "./framing.ts"

interface LaunchParams {
  argv?: string[]
  cwd?: string
  first?: boolean
}

export interface RuntimeOptions {
  transport: Transport
  platform: Platform
  manifest: AppManifest | null
  info: RuntimeInfo
  onClose?: () => void
}

interface RequestParams {
  name?: string
  data?: Record<string, unknown>
  token?: string | number
  value?: unknown
  argv?: string[]
  cwd?: string
  first?: boolean
  [key: string]: unknown
}

interface RequestMessage {
  id?: number
  method: string
  params?: RequestParams
}

interface RuntimeApi {
  send: (message: unknown) => void
  start: () => void
  wireApp: () => void
  handleRequest: (message: unknown) => Promise<void>
  reportError: (scope: string, error: unknown) => void
  dispatchLaunch: (params: LaunchParams) => void
}

const microtask = (fn: () => void): void => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn)

    return
  }

  void Promise.resolve().then(fn)
}

/**
 * Engine-neutral runtime: host requests, store sync, capabilities and app
 * wiring. The entry point (`bun.ts`, an embedded engine) owns loading the app
 * and the process-specific hooks.
 */
export const createRuntime = (options: RuntimeOptions): RuntimeApi => {
  const { transport, platform } = options

  const send = (message: unknown): void => transport.send(message)

  setManifest(options.manifest)
  installCapabilities(platform)
  setPermissionGate(createPermissionGate(options.manifest?.permissions))

  netInternals.install(
    {
      supportsBinary: transport.supportsBinary,
      send,
      sendBinary: (streamId, data) => transport.sendBinary(streamId, data),
    },
    assertCapability,
  )
  transport.onData((streamId, data) => netInternals.handleData(streamId, data))

  let appWired = false
  const pendingLaunch: LaunchParams[] = []

  let markAppReady: () => void = () => {}
  const appReady = new Promise<void>((resolve) => {
    markAppReady = resolve
  })

  const dispatchLaunch = (params: LaunchParams): void => {
    const app = App.current
    if (!app) return

    const argv = params.argv ?? []
    const cwd = params.cwd ?? platform.cwd()

    if (params.first === false) app.dispatchEvent("second-instance", { argv, cwd })

    const { urls, files } = parseLaunchArgs(argv, cwd)

    for (const url of urls) app.dispatchEvent("open-url", { url })
    for (const path of files) app.dispatchEvent("open-file", { path })
  }

  registerCapability("window", (params: unknown) => {
    send({ jsonrpc: "2.0", method: "__window", params: params ?? {} })

    return Promise.resolve(true)
  })

  const pendingDialogs = new Map<string, (value: unknown) => void>()
  let dialogToken = 0

  const requestDialog = (kind: string, params: unknown): Promise<unknown> => {
    const token = String(++dialogToken)

    return new Promise((resolve) => {
      pendingDialogs.set(token, resolve)
      send({ jsonrpc: "2.0", method: "__dialog", params: { token, kind, ...(params as object) } })
    })
  }

  const requestExport = (params: unknown): Promise<unknown> => {
    const token = String(++dialogToken)

    return new Promise((resolve) => {
      pendingDialogs.set(token, resolve)
      send({ jsonrpc: "2.0", method: "__export", params: { token, ...(params as object) } })
    })
  }

  registerCapability("dialog.openFile", (params) => requestDialog("open", params))
  registerCapability("dialog.openFiles", (params) => requestDialog("open-files", params))
  registerCapability("dialog.openDirectory", (params) => requestDialog("open-directory", params))
  registerCapability("dialog.saveFile", (params) => requestDialog("save", params))
  registerCapability("dialog.message", (params) => requestDialog("message", params))
  registerCapability("fs.exportTo", (params) => requestExport(params))

  registerCapability("fs.open", (params: unknown) => {
    send({ jsonrpc: "2.0", method: "__open", params: params ?? {} })

    return Promise.resolve(true)
  })

  registerCapability("dialog.toast", (params: unknown) => {
    send({ jsonrpc: "2.0", method: "__toast", params: params ?? {} })

    return Promise.resolve(true)
  })

  registerCapability("tray", (params: unknown) => {
    send({ jsonrpc: "2.0", method: "__tray", params: params ?? {} })

    return Promise.resolve(true)
  })

  const pendingQueries = new Map<string, (value: unknown) => void>()
  let queryToken = 0

  const hostQuery = (kind: string, params: unknown = {}): Promise<unknown> => {
    const token = String(++queryToken)

    return new Promise((resolve) => {
      pendingQueries.set(token, resolve)
      send({ jsonrpc: "2.0", method: "__query", params: { token, kind, ...(params as object) } })
    })
  }

  registerCapability("screen.list", () => hostQuery("screen.list"))
  registerCapability("theme.get", () => hostQuery("theme.get"))

  registerCapability("secure.available", () => hostQuery("secure.available"))
  registerCapability("secure.get", (params) => hostQuery("secure.get", params))
  registerCapability("secure.set", (params) => hostQuery("secure.set", params))
  registerCapability("secure.remove", (params) => hostQuery("secure.remove", params))

  let notifyToken = 0
  registerCapability("shell.notify", (params: unknown) => {
    const token = String(++notifyToken)
    send({ jsonrpc: "2.0", method: "__notify", params: { token, ...(params as object) } })

    return Promise.resolve(token)
  })

  registerCapability("system.locale", () => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions()
      const language = resolved.locale.split("-")[0] ?? resolved.locale

      return Promise.resolve({ locale: resolved.locale, language, timezone: resolved.timeZone })
    } catch {
      const timezone = platform.env("TZ") ?? "UTC"

      return Promise.resolve({ locale: "en-US", language: "en", timezone })
    }
  })

  registerCapability("nw.fetch", (params: unknown) => {
    const { url, ...rest } = params as { url: string }

    return net.fetch(url, rest)
  })

  registerCapability("nw.abort", (params: unknown) => {
    net.abort(Number((params as { id?: number }).id ?? 0))

    return Promise.resolve(true)
  })

  const reportError = (scope: string, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    console.error(`[pulsar] ${scope}:`, error)
    send({ jsonrpc: "2.0", method: "__error", params: { scope, message, stack } })
  }

  const fullState = (): Record<string, unknown> => {
    return App.current ? App.current.store.snapshot() : {}
  }

  const patchState = (): { state?: Record<string, unknown>; unset?: string[] } => {
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

  const schedulePush = (): void => {
    if (inRequest || pushScheduled) return

    pushScheduled = true

    microtask(() => {
      pushScheduled = false
      if (inRequest) return

      const patch = patchState()

      if (patch.state || patch.unset) send({ jsonrpc: "2.0", method: "__state", params: patch })
    })
  }

  const wireApp = (): void => {
    const app = App.current

    if (app) {
      app.store.onChange = schedulePush
      app.onQuit = () => send({ jsonrpc: "2.0", method: "__quit" })
      app.onSend = (event, payload, target) =>
        send({ jsonrpc: "2.0", method: "__emit", params: { event, payload, target } })
      app.onCreateWindow = (config) =>
        send({ jsonrpc: "2.0", method: "__window", params: { ...config, action: "create" } })
      app.onSendUi = (label, tree) => send({ jsonrpc: "2.0", method: "__ui", params: { target: label, tree } })
      app.onAddRecentDocument = (path) => send({ jsonrpc: "2.0", method: "__recent", params: { action: "add", path } })
      app.onClearRecentDocuments = () => send({ jsonrpc: "2.0", method: "__recent", params: { action: "clear" } })
      app.flushRecentDocuments()

      send({ jsonrpc: "2.0", method: "__config", params: { windows: app.windows } })
      app.flushAllUi()
    }

    appWired = true

    for (const launch of pendingLaunch.splice(0)) dispatchLaunch(launch)

    markAppReady()
  }

  const handleUiEvent = (data: Record<string, unknown>): void => {
    if (data.event === "focus") App.current?.noteUiFocus(true)
    else if (data.event === "blur") App.current?.noteUiFocus(false)

    dispatchUiEvent(Number(data.id), String(data.event), data.value)
  }

  const handleNotification = (req: RequestMessage, params: RequestParams): void => {
    if (req.method === "__log") {
      App.current?.dispatchEvent("log", params)

      return
    }

    if (req.method === "__event") {
      if (params.name === "ui-event") {
        handleUiEvent(params.data ?? {})

        return
      }

      if (params.name === "back-pressed" && !App.current?.hasEvent("back-pressed")) {
        send({ jsonrpc: "2.0", method: "__quit" })

        return
      }

      App.current?.dispatchEvent(params.name!, params.data ?? {})

      return
    }

    if (req.method === "__dialog-result" || req.method === "__export-result") {
      const resolve = pendingDialogs.get(String(params.token))

      if (resolve) {
        pendingDialogs.delete(String(params.token))
        resolve(params.value ?? null)
      }

      return
    }

    if (req.method === "__query-result") {
      const resolve = pendingQueries.get(String(params.token))

      if (resolve) {
        pendingQueries.delete(String(params.token))
        resolve(params.value ?? null)
      }

      return
    }

    if (req.method === "__net-event") {
      netInternals.handleMessage(params)

      return
    }

    if (req.method === "__launch") {
      if (appWired) dispatchLaunch(params as LaunchParams)
      else pendingLaunch.push(params as LaunchParams)
    }
  }

  const handleRequest = async (message: unknown): Promise<void> => {
    const req = message as RequestMessage

    if (req.id === undefined) {
      handleNotification(req, req.params ?? {})

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
      if (req.method === "ui-event") {
        handleUiEvent(req.params ?? {})

        send({ jsonrpc: "2.0", id: req.id, result: true, ...patchState() })

        return
      }

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
      const message = e instanceof Error ? e.message : String(e)

      send({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message }, ...patchState() })
    } finally {
      inRequest = false
    }
  }

  const start = (): void => {
    transport.onClose(() => options.onClose?.())

    transport.onMessage((message) => {
      void handleRequest(message)
    })

    send(buildHello(options.info, listCapabilities(), transport.supportsBinary))
    transport.start()
  }

  return {
    send,
    start,
    wireApp,
    handleRequest,
    reportError,
    dispatchLaunch,
  }
}

export type Runtime = ReturnType<typeof createRuntime>
