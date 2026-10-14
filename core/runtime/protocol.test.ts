import { describe, expect, test } from "bun:test"
import {
  FRAME_CONTROL,
  FRAME_DATA,
  PROTOCOL_VERSION,
  encodeDataFrame,
  encodeFrame,
  makeHello,
  runtimeName,
  runtimeVersion,
} from "./protocol.ts"

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
    expect(hello.params.binary).toBe(true)
    expect(hello.params.capabilities).toEqual(["fs.readFile", "nw.fetch"])
  })
})

describe("framing", () => {
  test("encodes a control frame", () => {
    const payload = Buffer.from('{"a":1}', "utf8")
    const frame = Buffer.from(encodeFrame(FRAME_CONTROL, payload))

    expect(frame[0]).toBe(FRAME_CONTROL)
    expect(frame.readUInt32LE(1)).toBe(payload.byteLength)
    expect(frame.subarray(5).toString("utf8")).toBe('{"a":1}')
  })

  test("encodes a data frame with a stream id", () => {
    const frame = Buffer.from(encodeDataFrame(7, Buffer.from([1, 2, 3, 4])))

    expect(frame[0]).toBe(FRAME_DATA)
    expect(frame.readUInt32LE(5)).toBe(7)
    expect([...frame.subarray(9)]).toEqual([1, 2, 3, 4])
  })
})
