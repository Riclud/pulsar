import { describe, expect, test } from "bun:test"
import { registerCapability } from "./caps.ts"
import { NetError, net, netInternals } from "./net.ts"

class FakeTransport {
  readonly supportsBinary = true
  readonly messages: Array<{ method: string; params: Record<string, unknown> }> = []

  send(message: unknown): void {
    this.messages.push(message as { method: string; params: Record<string, unknown> })
  }

  sendBinary(): void {}
}

const setup = (guard: (name: string) => void = () => {}): FakeTransport => {
  const transport = new FakeTransport()
  netInternals.install(transport, guard)

  return transport
}

const lastParams = (transport: FakeTransport): Record<string, unknown> => {
  return transport.messages.at(-1)!.params
}

describe("net", () => {
  test("sends method, headers and body", () => {
    const transport = setup()

    net.request("https://example.com/a", {
      method: "POST",
      headers: { "X-Test": "1" },
      body: "hello",
      timeoutMs: 500,
    })

    expect(lastParams(transport)).toMatchObject({
      url: "https://example.com/a",
      method: "POST",
      headers: { "X-Test": "1" },
      body: "hello",
      bodyEncoding: "utf8",
      timeoutMs: 500,
    })
  })

  test("encodes a Uint8Array body as base64", () => {
    const transport = setup()

    net.request("https://example.com", { method: "PUT", body: new Uint8Array([1, 2, 3]) })

    expect(lastParams(transport)).toMatchObject({ body: "AQID", bodyEncoding: "base64" })
  })

  test("maps tlsFingerprint true to chrome120", () => {
    const transport = setup()

    net.request("https://example.com", { tlsFingerprint: true })

    expect(lastParams(transport).tlsFingerprint).toBe("chrome120")
  })

  test("fetch accumulates text chunks", async () => {
    const transport = setup()
    const pending = net.fetch("https://example.com/a")
    const id = lastParams(transport).id as number

    netInternals.handleMessage({
      id,
      type: "response",
      status: 200,
      statusText: "OK",
      url: "https://example.com/a",
      headers: { "content-type": "text/plain" },
    })
    netInternals.handleMessage({ id, type: "data", text: "hel" })
    netInternals.handleMessage({ id, type: "data", text: "lo" })
    netInternals.handleMessage({ id, type: "end" })

    await expect(pending).resolves.toEqual({
      status: 200,
      statusText: "OK",
      url: "https://example.com/a",
      headers: { "content-type": "text/plain" },
      text: "hello",
    })
  })

  test("fetch joins binary chunks", async () => {
    const transport = setup()
    const pending = net.fetch("https://example.com/bin", { responseType: "binary" })
    const id = lastParams(transport).id as number

    netInternals.handleMessage({ id, type: "response", status: 200, statusText: "OK", url: "x", headers: {} })
    netInternals.handleData(id, new Uint8Array([9, 8]))
    netInternals.handleData(id, new Uint8Array([7]))
    netInternals.handleMessage({ id, type: "end" })

    const response = await pending
    expect(Array.from(response.bytes ?? [])).toEqual([9, 8, 7])
  })

  test("download streams chunks to a file with progress", async () => {
    const transport = setup()
    const writes: string[] = []
    const progress: Array<[number, number | null]> = []

    registerCapability("fs.exists", (async () => false) as never)
    registerCapability("fs.stat", (async () => ({ size: 0 })) as never)
    registerCapability("fs.writeFile", (async (p: { path: string }) => {
      writes.push(`write:${p.path}`)

      return true
    }) as never)
    registerCapability("fs.appendFile", (async (p: { content: string }) => {
      writes.push(`append:${p.content}`)

      return true
    }) as never)

    const pending = net.download("https://example.com/file", "/tmp/file", {
      onProgress: (received, total) => progress.push([received, total]),
    })

    for (let i = 0; i < 10 && transport.messages.length === 0; i++) await Promise.resolve()

    const id = lastParams(transport).id as number

    netInternals.handleMessage({
      id,
      type: "response",
      status: 200,
      statusText: "OK",
      url: "https://example.com/file",
      headers: { "content-length": "3" },
    })
    netInternals.handleMessage({ id, type: "data", text: "abc" })
    netInternals.handleMessage({ id, type: "end" })

    const result = await pending

    expect(result).toMatchObject({ path: "/tmp/file", bytes: 3, resumed: false, status: 200 })
    expect(writes).toEqual(["write:/tmp/file", "append:YWJj"])
    expect(progress.at(-1)).toEqual([3, 3])
  })

  test("abort sends an abort action", () => {
    const transport = setup()
    const request = net.request("https://example.com")

    request.abort()

    expect(lastParams(transport)).toEqual({ id: request.id, action: "abort" })
  })

  test("rejects with NetError on a host error", async () => {
    const transport = setup()
    const pending = net.fetch("https://example.com")
    const id = lastParams(transport).id as number

    netInternals.handleMessage({ id, type: "error", code: "ERR_TIMEOUT", message: "timed out" })

    try {
      await pending
      throw new Error("expected a rejection")
    } catch (e) {
      expect(e).toBeInstanceOf(NetError)
      expect((e as NetError).code).toBe("ERR_TIMEOUT")
    }
  })

  test("enforces the net permission", () => {
    setup((name) => {
      if (name === "nw.request") throw new Error(`permission denied: ${name}`)
    })

    expect(() => net.request("https://example.com")).toThrow(/permission denied/)
  })

  test("rejects unsupported URLs", () => {
    setup()

    expect(() => net.request("file:///tmp/x")).toThrow(/unsupported URL/)
  })
})

describe("net.websocket", () => {
  test("opens with headers and protocols", () => {
    const transport = setup()

    const socket = net.websocket("wss://example.com/ws", {
      headers: { "X-Test": "1" },
      protocols: ["chat", "v2"],
      timeoutMs: 500,
    })

    expect(lastParams(transport)).toMatchObject({
      id: socket.id,
      action: "websocket",
      url: "wss://example.com/ws",
      headers: { "X-Test": "1" },
      protocols: ["chat", "v2"],
      timeoutMs: 500,
    })
  })

  test("sends text and binary messages", () => {
    const transport = setup()
    const socket = net.websocket("wss://example.com/ws")

    socket.send("hello")
    expect(lastParams(transport)).toMatchObject({ id: socket.id, action: "websocket-send", text: "hello" })

    socket.send(new Uint8Array([1, 2, 3]))
    expect(lastParams(transport)).toMatchObject({
      id: socket.id,
      action: "websocket-send",
      base64: "AQID",
      encoding: "base64",
    })
  })

  test("closes with a code and reason", () => {
    const transport = setup()
    const socket = net.websocket("wss://example.com/ws")

    socket.close(1001, "going away")

    expect(lastParams(transport)).toEqual({
      id: socket.id,
      action: "websocket-close",
      code: 1001,
      reason: "going away",
    })
  })

  test("delivers open, text, binary and close events", () => {
    const transport = setup()
    const socket = net.websocket("wss://example.com/ws")
    const id = lastParams(transport).id as number

    const seen: string[] = []

    socket.on("open", (info) => seen.push(`open:${info.protocol}`))
    socket.on("message", (data) => {
      seen.push(typeof data === "string" ? `text:${data}` : `bin:${Array.from(data).join(",")}`)
    })
    socket.on("close", (info) => seen.push(`close:${info.code}:${info.reason}:${info.wasClean}`))

    netInternals.handleMessage({ id, type: "open", protocol: "chat" })
    netInternals.handleMessage({ id, type: "message", text: "hello" })
    netInternals.handleData(id, new Uint8Array([1, 2, 3]))
    netInternals.handleMessage({ id, type: "close", code: 1000, reason: "bye", wasClean: true })

    expect(seen).toEqual(["open:chat", "text:hello", "bin:1,2,3", "close:1000:bye:true"])
  })

  test("delivers errors, enforces permissions and validates the URL", () => {
    const transport = setup()
    const socket = net.websocket("wss://example.com/ws")
    const id = lastParams(transport).id as number

    const errors: string[] = []

    socket.on("error", (error) => errors.push(error.code))
    netInternals.handleMessage({ id, type: "error", code: "ERR_TLS", message: "handshake failed" })

    expect(errors).toEqual(["ERR_TLS"])

    setup((name) => {
      if (name === "nw.websocket") throw new Error(`permission denied: ${name}`)
    })

    expect(() => net.websocket("wss://example.com/ws")).toThrow(/permission denied/)

    setup()

    expect(() => net.websocket("http://example.com/ws")).toThrow(/unsupported WebSocket URL/)
  })
})
