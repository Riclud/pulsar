import { FRAME_CONTROL, FRAME_DATA, MAX_FRAME, encodeDataFrame, encodeFrame, type Transport } from "./framing.ts"

/** Newline-delimited JSON over stdin/stdout. Bun and Node only. */
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
