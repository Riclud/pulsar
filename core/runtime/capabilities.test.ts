import { describe, expect, test } from "bun:test"
import type { AppPaths, Platform } from "../platform.ts"
import { dialog, fs } from "../sdk/index.ts"
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

interface SentMessage {
  method?: string
  params?: Record<string, unknown>
}

const harness = () => {
  const sent: SentMessage[] = []
  let deliver: ((message: unknown) => void) | null = null

  const transport: Transport = {
    supportsBinary: false,
    send: (message) => {
      sent.push(message as SentMessage)
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
    manifest: { id: "test", permissions: ["fs", "dialog"] },
    info: { name: "test", version: "1.0.0" },
  })

  runtime.start()

  return {
    sent,
    deliver: (message: unknown) => deliver?.(message),
  }
}

const last = (sent: SentMessage[]) => {
  return sent[sent.length - 1]!
}

describe("attachment capabilities", () => {
  test("fs.open asks the host and resolves", async () => {
    const app = harness()

    const ok = await fs.open("/tmp/report.pdf")

    expect(ok).toBe(true)
    expect(last(app.sent)).toMatchObject({ method: "__open", params: { path: "/tmp/report.pdf" } })
  })

  test("dialog.toast asks the host and resolves", async () => {
    const app = harness()

    const ok = await dialog.toast("Saved")

    expect(ok).toBe(true)
    expect(last(app.sent)).toMatchObject({ method: "__toast", params: { text: "Saved" } })
  })

  test("fs.exportTo resolves with the host reply", async () => {
    const app = harness()

    const pending = fs.exportTo("/tmp/report.pdf", "final.pdf")
    const message = last(app.sent)

    expect(message.method).toBe("__export")
    expect(message.params).toMatchObject({ path: "/tmp/report.pdf", name: "final.pdf" })

    app.deliver({
      jsonrpc: "2.0",
      method: "__export-result",
      params: { token: message.params?.token, value: true },
    })

    expect(await pending).toBe(true)
  })

  test("fs.exportTo reports a failed copy", async () => {
    const app = harness()

    const pending = fs.exportTo("/tmp/report.pdf")
    const message = last(app.sent)

    app.deliver({
      jsonrpc: "2.0",
      method: "__export-result",
      params: { token: message.params?.token, value: false },
    })

    expect(await pending).toBe(false)
  })

  test("a stale __export-result is ignored", async () => {
    const app = harness()

    app.deliver({
      jsonrpc: "2.0",
      method: "__export-result",
      params: { token: "999", value: true },
    })

    const pending = fs.exportTo("/tmp/report.pdf")
    const message = last(app.sent)

    app.deliver({
      jsonrpc: "2.0",
      method: "__export-result",
      params: { token: message.params?.token, value: true },
    })

    expect(await pending).toBe(true)
  })
})
