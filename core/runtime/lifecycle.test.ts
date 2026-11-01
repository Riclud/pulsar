import { describe, expect, spyOn, test } from "bun:test"
import type { AppPaths, Platform } from "../platform.ts"
import { App, Button } from "../sdk/index.ts"
import { createRuntime } from "./core.ts"
import type { Transport } from "./framing.ts"

const paths = (): AppPaths => ({
  data: "/tmp/data",
  config: "/tmp/config",
  cache: "/tmp/cache",
  temp: "/tmp",
  home: "/tmp",
})

const testPlatform = (): Platform => ({
  name: "test",
  kind: "desktop",
  os: "linux",

  env: () => undefined,
  cwd: () => "/tmp",
  appId: () => "test",
  paths: () => Promise.resolve(paths()),

  readFile: () => Promise.resolve(""),
  writeFile: () => Promise.resolve(true),
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

const harness = () => {
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
    platform: testPlatform(),
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

describe("lifecycle events", () => {
  test("back without a handler quits the app", async () => {
    const app = harness()
    new App()

    app.deliver(event("back-pressed"))
    await flush()

    expect(app.sent.some((message) => message.method === "__quit")).toBe(true)
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
