import { assertCapability } from "./caps.ts"

export interface NetTransport {
  readonly supportsBinary: boolean
  send(message: unknown): void
  sendBinary(streamId: number, data: Uint8Array): void
}

export interface NetOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
  timeoutMs?: number
  redirect?: "follow" | "manual" | "error"
  maxRedirects?: number
  responseType?: "text" | "binary" | "auto"
  tlsFingerprint?: boolean | string
}

export interface NetResponseInfo {
  status: number
  statusText: string
  url: string
  headers: Record<string, string>
}

export interface NetResponse extends NetResponseInfo {
  text: string
  bytes?: Uint8Array
}

export interface NetErrorData {
  code: string
  message: string
}

export class NetError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "NetError"
    this.code = code
  }
}

export interface NetRequest {
  readonly id: number
  on(event: "response", fn: (info: NetResponseInfo) => void): this
  on(event: "data", fn: (chunk: string | Uint8Array) => void): this
  on(event: "end", fn: () => void): this
  on(event: "error", fn: (error: NetErrorData) => void): this
  abort(): void
}

interface Listeners {
  response?: (info: NetResponseInfo) => void
  data?: (chunk: string | Uint8Array) => void
  end?: () => void
  error?: (error: NetErrorData) => void
}

export interface WebSocketOptions {
  headers?: Record<string, string>
  protocols?: string[]
  timeoutMs?: number
}

export interface WebSocketOpenInfo {
  protocol: string
}

export interface WebSocketCloseInfo {
  code: number
  reason: string
  wasClean: boolean
}

export interface NetWebSocket {
  readonly id: number
  on(event: "open", fn: (info: WebSocketOpenInfo) => void): this
  on(event: "message", fn: (data: string | Uint8Array) => void): this
  on(event: "close", fn: (info: WebSocketCloseInfo) => void): this
  on(event: "error", fn: (error: NetErrorData) => void): this
  send(data: string | Uint8Array): void
  close(code?: number, reason?: string): void
}

interface SocketListeners {
  open?: (info: WebSocketOpenInfo) => void
  message?: (data: string | Uint8Array) => void
  close?: (info: WebSocketCloseInfo) => void
  error?: (error: NetErrorData) => void
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

const bytesToBase64 = (bytes: Uint8Array): string => {
  let out = ""

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0

    out += BASE64[a >> 2]
    out += BASE64[((a & 3) << 4) | (b >> 4)]
    out += i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : "="
    out += i + 2 < bytes.length ? BASE64[c & 63] : "="
  }

  return out
}

const base64ToBytes = (value: string): Uint8Array => {
  const text = value.replace(/[^A-Za-z0-9+/]/g, "")

  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4))

  let offset = 0

  for (let i = 0; i < text.length; i += 4) {
    const a = BASE64.indexOf(text[i] ?? "A")
    const b = BASE64.indexOf(text[i + 1] ?? "A")
    const c = BASE64.indexOf(text[i + 2] ?? "A")
    const d = BASE64.indexOf(text[i + 3] ?? "A")
    const n = (a << 18) | (b << 12) | (c << 6) | d

    if (offset < bytes.length) bytes[offset++] = (n >> 16) & 255
    if (offset < bytes.length && i + 2 < text.length) bytes[offset++] = (n >> 8) & 255
    if (offset < bytes.length && i + 3 < text.length) bytes[offset++] = n & 255
  }

  return bytes
}

const encodeBody = (body?: string | Uint8Array): { body: string; encoding: "utf8" | "base64" } | null => {
  if (body === undefined) return null
  if (typeof body === "string") return { body, encoding: "utf8" }

  return { body: bytesToBase64(body), encoding: "base64" }
}

class RequestHandle implements NetRequest {
  private listeners: Listeners = {}

  constructor(
    readonly id: number,
    private readonly client: NetClient,
  ) {}

  on(event: "response", fn: (info: NetResponseInfo) => void): this
  on(event: "data", fn: (chunk: string | Uint8Array) => void): this
  on(event: "end", fn: () => void): this
  on(event: "error", fn: (error: NetErrorData) => void): this
  on(event: string, fn: (value: never) => void): this {
    const listeners = this.listeners as Record<string, unknown>

    listeners[event] = fn

    return this
  }

  abort(): void {
    this.client.abortRequest(this.id)
  }

  emitResponse(info: NetResponseInfo): void {
    this.listeners.response?.(info)
  }

  emitData(chunk: string | Uint8Array): void {
    this.listeners.data?.(chunk)
  }

  emitEnd(): void {
    this.listeners.end?.()
  }

  emitError(error: NetErrorData): void {
    this.listeners.error?.(error)
  }
}

class SocketHandle implements NetWebSocket {
  private listeners: SocketListeners = {}

  constructor(
    readonly id: number,
    private readonly client: NetClient,
  ) {}

  on(event: "open", fn: (info: WebSocketOpenInfo) => void): this
  on(event: "message", fn: (data: string | Uint8Array) => void): this
  on(event: "close", fn: (info: WebSocketCloseInfo) => void): this
  on(event: "error", fn: (error: NetErrorData) => void): this
  on(event: string, fn: (value: never) => void): this {
    const listeners = this.listeners as Record<string, unknown>

    listeners[event] = fn

    return this
  }

  send(data: string | Uint8Array): void {
    this.client.sendSocket(this.id, data)
  }

  close(code = 1000, reason = ""): void {
    this.client.closeSocket(this.id, code, reason)
  }

  emitOpen(info: WebSocketOpenInfo): void {
    this.listeners.open?.(info)
  }

  emitMessage(data: string | Uint8Array): void {
    this.listeners.message?.(data)
  }

  emitClose(info: WebSocketCloseInfo): void {
    this.listeners.close?.(info)
  }

  emitError(error: NetErrorData): void {
    this.listeners.error?.(error)
  }
}

class NetClient {
  private transport: NetTransport | null = null
  private guard: (name: string) => void = () => {}
  private nextId = 1
  private readonly requests = new Map<number, RequestHandle>()
  private readonly sockets = new Map<number, SocketHandle>()

  install(transport: NetTransport, guard: (name: string) => void): void {
    this.transport = transport
    this.guard = guard
    this.requests.clear()
    this.sockets.clear()
    this.nextId = 1
  }

  private allocateID(): number {
    const id = this.nextId

    this.nextId = this.nextId >= 0xffffffff ? 1 : this.nextId + 1

    return id
  }

  request(url: string, options: NetOptions = {}): NetRequest {
    const transport = this.transport

    if (!transport) throw new Error("net: the runtime transport is not ready")

    this.guard("nw.request")
    if (!/^https?:\/\//i.test(url)) throw new Error(`net: unsupported URL: ${url}`)

    const id = this.allocateID()

    const handle = new RequestHandle(id, this)

    this.requests.set(id, handle)

    const body = encodeBody(options.body)
    const fingerprint = options.tlsFingerprint === true ? "chrome120" : options.tlsFingerprint

    transport.send({
      jsonrpc: "2.0",
      method: "__net",
      params: {
        id,
        action: "request",
        url,
        method: options.method ?? "GET",
        headers: options.headers ?? {},
        body: body?.body,
        bodyEncoding: body?.encoding,
        timeoutMs: options.timeoutMs,
        redirect: options.redirect,
        maxRedirects: options.maxRedirects,
        responseType: options.responseType,
        tlsFingerprint: fingerprint || undefined,
      },
    })

    return handle
  }

  websocket(url: string, options: WebSocketOptions = {}): NetWebSocket {
    const transport = this.transport

    if (!transport) throw new Error("net: the runtime transport is not ready")

    this.guard("nw.websocket")
    if (!/^wss?:\/\//i.test(url)) throw new Error(`net: unsupported WebSocket URL: ${url}`)

    const id = this.allocateID()
    const handle = new SocketHandle(id, this)

    this.sockets.set(id, handle)

    transport.send({
      jsonrpc: "2.0",
      method: "__net",
      params: {
        id,
        action: "websocket",
        url,
        headers: options.headers ?? {},
        protocols: options.protocols ?? [],
        timeoutMs: options.timeoutMs,
      },
    })

    return handle
  }

  sendSocket(id: number, data: string | Uint8Array): void {
    if (!this.transport) return

    if (typeof data === "string") {
      this.transport.send({
        jsonrpc: "2.0",
        method: "__net",
        params: { id, action: "websocket-send", text: data },
      })

      return
    }

    this.transport.send({
      jsonrpc: "2.0",
      method: "__net",
      params: { id, action: "websocket-send", base64: bytesToBase64(data), encoding: "base64" },
    })
  }

  closeSocket(id: number, code: number, reason: string): void {
    if (!this.transport) return

    this.transport.send({
      jsonrpc: "2.0",
      method: "__net",
      params: { id, action: "websocket-close", code, reason },
    })
  }

  fetch(url: string, options: NetOptions = {}): Promise<NetResponse> {
    return new Promise((resolve, reject) => {
      const request = this.request(url, options)

      let info: NetResponseInfo = { status: 0, statusText: "", url, headers: {} }

      let text = ""

      let binary: Uint8Array[] | null = null
      let total = 0

      request.on("response", (value) => {
        info = value
      })
      request.on("data", (chunk) => {
        if (typeof chunk === "string") {
          text += chunk

          return
        }

        binary ??= []
        binary.push(chunk)
        total += chunk.byteLength
      })
      request.on("end", () => {
        if (!binary) {
          resolve({ ...info, text })

          return
        }

        const bytes = new Uint8Array(total)

        let offset = 0

        for (const chunk of binary) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }

        resolve({ ...info, text: "", bytes })
      })
      request.on("error", (error) => reject(new NetError(error.code, error.message)))
    })
  }

  abortRequest(id: number): void {
    if (!this.transport) return
    this.transport.send({ jsonrpc: "2.0", method: "__net", params: { id, action: "abort" } })
  }

  handleMessage(message: unknown): boolean {
    const params = message as {
      id?: number
      type?: string
      status?: number
      statusText?: string
      url?: string
      headers?: Record<string, string>
      text?: string
      base64?: string
      code?: string | number
      message?: string
      protocol?: string
      reason?: string
      wasClean?: boolean
    }

    const id = Number(params.id)
    const socket = this.sockets.get(id)

    if (socket) {
      if (params.type === "open") {
        socket.emitOpen({ protocol: String(params.protocol ?? "") })

        return true
      }

      if (params.type === "message") {
        const data = typeof params.text === "string" ? params.text : base64ToBytes(params.base64 ?? "")

        socket.emitMessage(data)

        return true
      }

      if (params.type === "close") {
        this.sockets.delete(id)
        socket.emitClose({
          code: Number(params.code ?? 1006),
          reason: String(params.reason ?? ""),
          wasClean: params.wasClean === true,
        })

        return true
      }

      if (params.type === "error") {
        this.sockets.delete(id)
        socket.emitError({
          code: String(params.code ?? "ERR_NETWORK"),
          message: String(params.message ?? "network error"),
        })

        return true
      }

      return false
    }

    const request = this.requests.get(id)

    if (!request) return false

    if (params.type === "response") {
      request.emitResponse({
        status: Number(params.status ?? 0),
        statusText: String(params.statusText ?? ""),
        url: String(params.url ?? ""),
        headers: params.headers ?? {},
      })

      return true
    }

    if (params.type === "data") {
      const chunk = typeof params.text === "string" ? params.text : base64ToBytes(params.base64 ?? "")

      request.emitData(chunk)

      return true
    }

    if (params.type === "end") {
      this.requests.delete(id)
      request.emitEnd()

      return true
    }

    if (params.type === "error") {
      this.requests.delete(id)
      request.emitError({
        code: String(params.code ?? "ERR_NETWORK"),
        message: String(params.message ?? "network error"),
      })

      return true
    }

    return false
  }

  handleData(id: number, data: Uint8Array): void {
    const socket = this.sockets.get(id)

    if (socket) {
      socket.emitMessage(data)

      return
    }

    this.requests.get(id)?.emitData(data)
  }
}

const client = new NetClient()

/** HTTP/HTTPS requests and WebSockets. Runs in the native host, independent of the JS engine. */
export const net = {
  fetch: (url: string, options?: NetOptions): Promise<NetResponse> => client.fetch(url, options),
  request: (url: string, options?: NetOptions): NetRequest => client.request(url, options),
  websocket: (url: string, options?: WebSocketOptions): NetWebSocket => client.websocket(url, options),
  abort: (id: number): void => client.abortRequest(id),
}

export const netInternals = {
  install: (transport: NetTransport, guard: (name: string) => void): void => client.install(transport, guard),
  handleMessage: (message: unknown): boolean => client.handleMessage(message),
  handleData: (id: number, data: Uint8Array): void => client.handleData(id, data),
}
