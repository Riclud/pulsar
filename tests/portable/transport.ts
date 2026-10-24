import type { Transport } from "../../core/runtime/framing.ts"

export interface SentMessage {
  message: unknown
  binary?: {
    streamId: number
    data: Uint8Array
  }
}

export const createFakeTransport = (): Transport & {
  sent: SentMessage[]
} => {
  let messageHandler: ((message: unknown) => void) | null = null
  let dataHandler: ((streamId: number, data: Uint8Array) => void) | null = null
  let closeHandler: (() => void) | null = null

  const sent: SentMessage[] = []

  return {
    supportsBinary: true,
    sent,
    send: (message) => sent.push({ message }),
    sendBinary: (streamId, data) => sent.push({ message: null, binary: { streamId, data } }),
    onMessage: (handler) => {
      messageHandler = handler
    },
    onData: (handler) => {
      dataHandler = handler
    },
    onClose: (handler) => {
      closeHandler = handler
    },
    start: () => {},
    close: () => {},
  }
}
