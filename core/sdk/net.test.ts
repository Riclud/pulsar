import { describe, expect, test } from "bun:test"
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
