export const PROTOCOL_VERSION = 1

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

export interface RuntimeInfo {
  name: string
  version: string
}

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

export const buildHello = (runtime: RuntimeInfo, capabilities: string[], binary = true): HelloMessage => {
  return {
    jsonrpc: "2.0",
    method: "__hello",
    params: {
      protocol: PROTOCOL_VERSION,
      runtime: runtime.name,
      version: runtime.version,
      capabilities,
      binary,
    },
  }
}

export const encodeFrame = (type: number, payload: Uint8Array): Uint8Array => {
  const frame = new Uint8Array(5 + payload.byteLength)

  frame[0] = type
  new DataView(frame.buffer).setUint32(1, payload.byteLength, true)
  frame.set(payload, 5)

  return frame
}

export const encodeDataFrame = (streamId: number, data: Uint8Array): Uint8Array => {
  const payload = new Uint8Array(4 + data.byteLength)
  new DataView(payload.buffer).setUint32(0, streamId >>> 0, true)
  payload.set(data, 4)

  return encodeFrame(FRAME_DATA, payload)
}
