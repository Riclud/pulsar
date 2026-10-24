import type { Transport } from "./framing.ts"

declare const __pulsarSend: (json: string) => void
declare const __pulsarSendBinary: (streamId: number, data: ArrayBuffer) => void

interface PulsarGlobal {
  __pulsarReceive?: (json: string) => void
}

/** Transport between the in-process host and the TS runtime inside QuickJS. */
export const createEmbeddedTransport = (): Transport => {
  let messageHandler: ((message: unknown) => void) | null = null
  let dataHandler: ((streamId: number, data: Uint8Array) => void) | null = null

  const global = globalThis as PulsarGlobal

  global.__pulsarReceive = (json: string) => {
    try {
      messageHandler?.(JSON.parse(json))
    } catch {}
  }

  return {
    supportsBinary: true,

    send: (message) => __pulsarSend(JSON.stringify(message)),

    sendBinary: (streamId, data) => {
      const buffer = (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength)

      __pulsarSendBinary(streamId, buffer)
    },

    onMessage: (handler) => {
      messageHandler = handler
    },

    onData: (handler) => {
      dataHandler = handler
    },

    onClose: () => {},

    start: () => {},

    close: () => {
      global.__pulsarReceive = undefined
      dataHandler = null
    },
  }
}
