export const PROTOCOL_VERSION = 1

/**
 * Wire framing shared by the runtime, the host and the bridge:
 *
 *   frame = type:u8 | length:u32 (LE) | payload[length]
 *
 * `type` is FRAME_CONTROL (JSON) or FRAME_DATA (binary). This keeps a binary
 * data channel on the same pipe, separate from the JSON control channel.
 */
export const FRAME_CONTROL = 0x01
export const FRAME_DATA = 0x02
export const MAX_FRAME = 64 << 20

export type Channel = "control" | "data"

export interface HelloParams {
  protocol: number
  runtime: string
  version: string
  capabilities: string[]
  binary: boolean
}

export interface HelloMessage {
  jsonrpc: "2.0"
  method: "__hello"
  params: HelloParams
}

/**
 * Transport carries protocol messages between the runtime and the host. The
 * stdio implementation talks over stdin/stdout; an in-process transport (an
 * embedded JS engine) can implement the same interface without a child process.
 *
 * Control messages are JSON. Binary payloads travel as data frames, tagged by a
 * numeric stream id, so bulk data never has to be base64'd into JSON.
 */
export interface Transport {
  readonly supportsBinary: boolean
  send(message: unknown): void
  sendBinary(streamId: number, data: Uint8Array): void
  onMessage(handler: (message: unknown) => void): void
  onData(handler: (streamId: number, data: Uint8Array) => void): void
  onClose(handler: () => void): void
  start(): void
  close(): void
}

export const runtimeName = (): string => {
  if (typeof Bun !== "undefined") return "bun"
  if (typeof process !== "undefined" && process.versions?.node) return "node"

  return "unknown"
}

export const runtimeVersion = (): string => {
  if (typeof Bun !== "undefined") return Bun.version ?? "0.0.0"

  return process.versions?.node ?? "0.0.0"
}

export const makeHello = (capabilities: string[]): HelloMessage => {
  return {
    jsonrpc: "2.0",
    method: "__hello",
    params: {
      protocol: PROTOCOL_VERSION,
      runtime: runtimeName(),
      version: runtimeVersion(),
      capabilities,
      binary: true,
    },
  }
}

export const encodeFrame = (type: number, payload: Uint8Array): Uint8Array => {
  const frame = Buffer.allocUnsafe(5 + payload.byteLength)
  frame[0] = type
  frame.writeUInt32LE(payload.byteLength, 1)
  frame.set(payload, 5)

  return frame
}

export const encodeDataFrame = (streamId: number, data: Uint8Array): Uint8Array => {
  const payload = Buffer.allocUnsafe(4 + data.byteLength)
  payload.writeUInt32LE(streamId >>> 0, 0)
  payload.set(data, 4)

  return encodeFrame(FRAME_DATA, payload)
}

/** Newline-delimited JSON over stdin/stdout. The control channel today. */
export const createStdioTransport = (): Transport => {
  let messageHandler: ((message: unknown) => void) | null = null
  let dataHandler: ((streamId: number, data: Uint8Array) => void) | null = null
  let closeHandler: (() => void) | null = null
  let buffer: Uint8Array = Buffer.alloc(0)
  let started = false

  const send = (message: unknown): void => {
    const payload = Buffer.from(JSON.stringify(message), "utf8")
    process.stdout.write(encodeFrame(FRAME_CONTROL, payload))
  }

  const sendBinary = (streamId: number, data: Uint8Array): void => {
    process.stdout.write(encodeDataFrame(streamId, data))
  }

  const drain = (): void => {
    while (buffer.byteLength >= 5) {
      const buf = buffer as Buffer
      const type = buf[0]!
      const length = buf.readUInt32LE(1)

      if (length > MAX_FRAME) {
        buffer = Buffer.alloc(0)
        closeHandler?.()
        return
      }
      if (buf.byteLength < 5 + length) return

      const payload = buf.subarray(5, 5 + length)
      buffer = buf.subarray(5 + length)

      if (type === FRAME_CONTROL) {
        try {
          messageHandler?.(JSON.parse(payload.toString("utf8")))
        } catch {
          send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })
        }
      } else if (type === FRAME_DATA && payload.byteLength >= 4) {
        const streamId = payload.readUInt32LE(0)
        dataHandler?.(streamId, payload.subarray(4))
      }
    }
  }

  const start = (): void => {
    if (started) return
    started = true

    process.stdin.on("data", (chunk: Buffer) => {
      buffer = buffer.byteLength === 0 ? chunk : Buffer.concat([buffer, chunk])
      drain()
    })
    process.stdin.on("end", () => closeHandler?.())
    process.stdin.on("close", () => closeHandler?.())
    process.stdin.resume()
  }

  const close = (): void => {
    process.stdin.pause()
  }

  return {
    supportsBinary: true,
    send,
    sendBinary,
    onMessage: (handler) => {
      messageHandler = handler
    },
    onData: (handler) => {
      dataHandler = handler
    },
    onClose: (handler) => {
      closeHandler = handler
    },
    start,
    close,
  }
}
