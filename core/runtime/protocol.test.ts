import { describe, expect, test } from "bun:test"
import { PROTOCOL_VERSION, makeHello, runtimeName, runtimeVersion } from "./protocol.ts"

describe("protocol handshake", () => {
  test("reports the bun runtime", () => {
    expect(runtimeName()).toBe("bun")
    expect(runtimeVersion().length).toBeGreaterThan(0)
  })

  test("builds a hello message", () => {
    const hello = makeHello(["fs.readFile", "nw.fetch"])

    expect(hello.jsonrpc).toBe("2.0")
    expect(hello.method).toBe("__hello")
    expect(hello.params.protocol).toBe(PROTOCOL_VERSION)
    expect(hello.params.runtime).toBe("bun")
    expect(hello.params.capabilities).toEqual(["fs.readFile", "nw.fetch"])
  })
})
