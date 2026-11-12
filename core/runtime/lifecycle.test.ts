import { describe, expect, spyOn, test } from "bun:test"
import type { AppPaths, Platform } from "../platform.ts"
import { App, Button, fs, registerCapability } from "../sdk/index.ts"
import { createRuntime } from "./core.ts"
import type { Transport } from "./framing.ts"

const paths = (): AppPaths => ({
  data: "/tmp/data",
  config: "/tmp/config",
  cache: "/tmp/cache",
  temp: "/tmp",
  home: "/tmp",
})

const testPlatform = (kind: Platform["kind"] = "desktop"): Platform => ({
  name: "test",
  kind,
  os: kind === "mobile" ? "android" : "linux",

  env: () => undefined,
  cwd: () => "/tmp",
  appId: () => "test",
  paths: () => Promise.resolve(paths()),

  readFile: () => Promise.resolve(""),
  writeFile: () => Promise.resolve(true),
  writeFileAtomic: () => Promise.resolve(true),
  appendBytes: () => Promise.resolve(true),
  appendFile: () => Promise.resolve(true),
  listDir: () => Promise.resolve([]),
  exists: () => Promise.resolve(false),
  stat: () => Promise.resolve({ size: 0, isFile: false, isDirectory: false, mtimeMs: 0, createdAtMs: 0 }),
  mkdir: () => Promise.resolve(true),
  remove: () => Promise.resolve(true),
  rename: () => Promise.resolve(true),
  copy: () => Promise.resolve(true),
  moveToTrash: () => Promise.resolve(true),

  openUrl: () => Promise.resolve(true),
})

const harness = (kind: Platform["kind"] = "desktop") => {
  const sent: { method?: string }[] = []
  let deliver: ((message: unknown) => void) | null = null

  const transport: Transport = {
    supportsBinary: false,
    send: (message) => {
      sent.push(message as { method?: string })
    },
    sendBinary: () => {},
    onMessage: (handler) => {
      deliver = handler
    },
    onData: () => {},
    onClose: () => {},
    start: () => {},
    close: () => {},
  }

  const runtime = createRuntime({
    transport,
    platform: testPlatform(kind),
    manifest: { id: "test", windows: [] },
    info: { name: "test", version: "1.0.0" },
  })

  runtime.start()

  return {
    runtime,
    sent,
    deliver: (message: unknown) => deliver?.(message),
  }
}

const event = (name: string, data: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  method: "__event",
  params: { name, data },
})

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("store sync", () => {
  test("pushes changes while a slow capability is pending", async () => {
    const app = harness()
    const instance = new App()
    let finish: (value: unknown) => void = () => {}

    registerCapability("test.slow", () => new Promise((resolve) => (finish = resolve)))
    app.runtime.wireApp()
    app.deliver({ id: 1, method: "test.slow", params: {} })
    await flush()

    instance.store.set("value", 1)
    await flush()

    const sent = app.sent as Array<{ method?: string; id?: number; params?: unknown; state?: unknown }>
    const pushed = sent.find((message) => message.method === "__state")

    expect(pushed?.params).toEqual({ state: { value: 1 } })

    finish(true)
    await flush()
    await flush()

    expect(sent.some((message) => message.id === 1)).toBe(true)
  })

  test("a reply still carries changes made while handling a request", async () => {
    const app = harness()
    const instance = new App()

    instance.on("set-value", () => instance.store.set("value", 2))
    app.runtime.wireApp()
    app.deliver({ id: 2, method: "set-value", params: {} })
    await flush()

    const sent = app.sent as Array<{ method?: string; id?: number; state?: unknown }>
    const reply = sent.find((message) => message.id === 2)

    expect(reply?.state).toEqual({ value: 2 })
    expect(app.sent.some((message) => message.method === "__state")).toBe(false)
  })
})

describe("fs.watch", () => {
  test("delivers the event that the hosts send", async () => {
    const app = harness()
    const paths: string[] = []

    new App()
    app.runtime.wireApp()

    await fs.watch("/watched", (path) => paths.push(path))

    app.deliver(event("fs-change", { path: "/watched" }))
    await flush()

    expect(paths).toEqual(["/watched"])
  })
})

describe("lifecycle events", () => {
  test("back without a handler quits a mobile app", async () => {
    const app = harness("mobile")

    new App()

    app.deliver(event("back-pressed"))
    await flush()

    expect(app.sent.some((message) => message.method === "__quit")).toBe(true)
  })

  test("back without a handler does nothing on the desktop", async () => {
    const app = harness()

    new App()

    app.deliver(event("back-pressed"))
    await flush()

    expect(app.sent.some((message) => message.method === "__quit")).toBe(false)
  })

  test("back with a handler is delivered instead of quitting", async () => {
    const app = harness()
    const instance = new App()
    const seen: string[] = []

    instance.on("back-pressed", () => {
      seen.push("back")
    })

    app.deliver(event("back-pressed"))
    await flush()

    expect(seen).toEqual(["back"])
    expect(app.sent.some((message) => message.method === "__quit")).toBe(false)
  })

  test("a throwing UI handler reports __error", async () => {
    const app = harness()
    const instance = new App()
    const errorSpy = spyOn(console, "error").mockImplementation(() => {})

    app.runtime.wireApp()

    let button: ReturnType<typeof Button> | undefined

    instance.window("main").render(() => {
      button = Button({
        label: "Boom",
        onClick: () => {
          throw new Error("boom in ui")
        },
      })

      return button
    })

    await flush()

    app.deliver({ jsonrpc: "2.0", id: 5, method: "ui-event", params: { id: button!.id, event: "click" } })
    await flush()
    errorSpy.mockRestore()

    const error = app.sent.find((message) => message.method === "__error") as
      { params?: { message?: string } } | undefined

    expect(error?.params?.message).toContain("boom in ui")
  })

  test("routes UI events by window and path", async () => {
    const app = harness()
    const instance = new App()

    let clicks = 0
    let button: ReturnType<typeof Button> | undefined

    app.runtime.wireApp()

    instance.window("main").render(() => {
      button = Button({ label: "Go", onClick: () => clicks++ })

      return button
    })

    await flush()

    app.deliver({
      jsonrpc: "2.0",
      id: 7,
      method: "ui-event",
      params: { target: "main", path: "/0", event: "click" },
    })
    await flush()

    expect(clicks).toBe(1)
  })

  test("restore seeds the store directly", async () => {
    const app = harness()
    const instance = new App()

    app.runtime.restore({ restored: 7 })
    await flush()

    expect(instance.store.get("restored")).toBe(7)
  })

  test("__restore seeds the store", async () => {
    const app = harness()
    const instance = new App()

    app.deliver({ jsonrpc: "2.0", method: "__restore", params: { state: { restored: 42 } } })
    await flush()

    expect(instance.store.get("restored")).toBe(42)
  })

  test("pause and resume reach the app", async () => {
    const app = harness()
    const instance = new App()
    const seen: string[] = []

    instance.on("app-pause", (payload) => {
      seen.push(`pause:${payload.state}`)
    })
    instance.on("app-resume", () => {
      seen.push("resume")
    })

    app.deliver(event("app-pause", { state: "inactive" }))
    app.deliver(event("app-resume"))
    await flush()

    expect(seen).toEqual(["pause:inactive", "resume"])
  })
})
