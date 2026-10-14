import { createInterface } from "readline"

export const PROTOCOL_VERSION = 1

export type Channel = "control" | "data"

export interface HelloParams {
  protocol: number
  runtime: string
  version: string
  capabilities: string[]
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
 * Control messages are JSON. A binary/streaming data channel is reserved:
 * transports that can carry raw bytes set `supportsBinary` and implement
 * `sendBinary`; otherwise it throws.
 */
export interface Transport {
  readonly supportsBinary: boolean
  send(message: unknown): void
  sendBinary(data: Uint8Array): void
  onMessage(handler: (message: unknown) => void): void
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
    },
  }
}

/** Newline-delimited JSON over stdin/stdout. The control channel today. */
export const createStdioTransport = (): Transport => {
  let messageHandler: ((message: unknown) => void) | null = null
  let closeHandler: (() => void) | null = null
  let reader: ReturnType<typeof createInterface> | null = null

  const send = (message: unknown): void => {
    process.stdout.write(JSON.stringify(message) + "\n")
  }

  const sendBinary = (_data: Uint8Array): void => {
    throw new Error("stdio transport has no binary channel; use send() for control messages")
  }

  const start = (): void => {
    if (reader) return

    reader = createInterface({ input: process.stdin, terminal: false })
    reader.on("close", () => closeHandler?.())
    reader.on("line", (raw) => {
      let message: unknown
      try {
        message = JSON.parse(raw)
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })
        return
      }
      messageHandler?.(message)
    })
  }

  const close = (): void => {
    reader?.close()
  }

  return {
    supportsBinary: false,
    send,
    sendBinary,
    onMessage: (handler) => {
      messageHandler = handler
    },
    onClose: (handler) => {
      closeHandler = handler
    },
    start,
    close,
  }
}
