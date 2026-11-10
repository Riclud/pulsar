import { assertCapability, fs } from "./caps.ts"

export interface NetTransport {
  readonly supportsBinary: boolean
  send(message: unknown): void
  sendBinary(streamId: number, data: Uint8Array): void
}

export interface NetOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
  /** Send this file as the body; the host streams it from disk. */
  bodyFile?: string
  timeoutMs?: number
  redirect?: "follow" | "manual" | "error"
  maxRedirects?: number
  responseType?: "text" | "binary" | "auto"
  tlsFingerprint?: boolean | string
  /** Largest response the host accepts; defaults to 64 MB, 0 removes the limit. */
  maxBytes?: number
  /** Reject with a NetError of kind "http" when the status is 400 or more. */
  throwOnError?: boolean
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
  /** True for a 2xx status. */
  ok: boolean
}

/** The part of an AbortSignal that downloads use, so the DOM type is not needed. */
export interface AbortSignalLike {
  readonly aborted: boolean
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: "abort", listener: () => void): void
}

export interface DownloadOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  /** Continue a partial file with a Range request when the server allows it. */
  resume?: boolean
  onProgress?: (received: number, total: number | null) => void
  /**
   * Cancels the download. The promise rejects with a NetError of kind "aborted" and the
   * partial file is deleted, unless `resume` is set: then it stays for the next attempt.
   */
  signal?: AbortSignalLike
  /** Reject with a NetError of kind "http" when the status is 400 or more, instead of saving the error page. */
  throwOnError?: boolean
}

export interface DownloadResult extends NetResponseInfo {
  path: string
  bytes: number
  resumed: boolean
}

export interface NetErrorData {
  code: string
  message: string
}

export type NetErrorKind =
  "timeout" | "dns" | "tls" | "refused" | "http" | "aborted" | "redirect" | "too-large" | "unsupported" | "network"

export interface NetErrorDetails {
  /** The URL of the request; only its host is put in the message, so a token in the query stays out of logs. */
  url?: string
  /** True when the server answered or the TLS handshake was reached, false when no connection was made, null when unknown. */
  connected?: boolean | null
  status?: number
}

const KIND_BY_CODE: Record<string, NetErrorKind> = {
  ERR_TIMEOUT: "timeout",
  ERR_DNS: "dns",
  ERR_TLS: "tls",
  ERR_REFUSED: "refused",
  ERR_ABORTED: "aborted",
  ERR_REDIRECT: "redirect",
  ERR_TOO_LARGE: "too-large",
  ERR_FINGERPRINT_UNAVAILABLE: "unsupported",
  ERR_UNSUPPORTED: "unsupported",
}

const hostOf = (url: string | undefined): string => {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]+|\[[^\]]*\])/i.exec(url ?? "")

  return match?.[1] ?? ""
}

/** Hosts that report a generic network error still say what happened in the text. */
const kindOf = (code: string, message: string): NetErrorKind => {
  const known = KIND_BY_CODE[code]

  if (known) return known
  if (code === "HTTP_STATUS") return "http"
  if (/not found|name resolution|lookup|dns/i.test(message)) return "dns"
  if (/refused/i.test(message)) return "refused"
  if (/ssl|tls|certificate|handshake/i.test(message)) return "tls"
  if (/timed? ?out/i.test(message)) return "timeout"

  return "network"
}

const connectedFor = (kind: NetErrorKind, details: NetErrorDetails): boolean | null => {
  if (details.connected !== undefined) return details.connected
  if (kind === "dns" || kind === "refused") return false
  if (kind === "tls" || kind === "http" || kind === "redirect" || kind === "too-large") return true

  return null
}

const CONNECTION_TEXT = { true: "connection made", false: "no connection made", null: "connection unknown" } as const

export class NetError extends Error {
  readonly code: string
  readonly kind: NetErrorKind
  readonly host: string
  readonly url: string
  readonly connected: boolean | null
  readonly status?: number

  constructor(code: string, message: string, details: NetErrorDetails = {}) {
    const kind = kindOf(code, message)
    const host = hostOf(details.url)
    const connected = connectedFor(kind, details)
    const where = host ? ` ${host}` : ""
    const status = details.status === undefined ? "" : ` ${details.status}`

    super(
      `${kind}${status}${where ? ` for${where}` : ""}: ${message} (${CONNECTION_TEXT[String(connected) as "true"]})`,
    )
    this.name = "NetError"
    this.code = code
    this.kind = kind
    this.host = host
    this.url = details.url ?? ""
    this.connected = connected
    if (details.status !== undefined) this.status = details.status
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

const textBytes = (value: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value)

  const out: number[] = []

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)

    if (code < 0x80) out.push(code)
    else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }

  return Uint8Array.from(out)
}

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
        bodyFile: options.bodyFile,
        timeoutMs: options.timeoutMs,
        redirect: options.redirect,
        maxRedirects: options.maxRedirects,
        responseType: options.responseType,
        tlsFingerprint: fingerprint || undefined,
        maxBytes: options.maxBytes,
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
      let responded = false
      let text = ""

      let binary: Uint8Array[] | null = null
      let total = 0

      const finish = (response: Omit<NetResponse, "ok">): void => {
        const ok = response.status >= 200 && response.status < 300

        if (options.throwOnError && response.status >= 400) {
          reject(new NetError("HTTP_STATUS", response.statusText || "request failed", { url, status: response.status }))

          return
        }

        resolve({ ...response, ok })
      }

      request.on("response", (value) => {
        info = value
        responded = true
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
          finish({ ...info, text })

          return
        }

        const bytes = new Uint8Array(total)

        let offset = 0

        for (const chunk of binary) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }

        finish({ ...info, text: "", bytes })
      })
      request.on("error", (error) => {
        reject(new NetError(error.code, error.message, { url, connected: responded ? true : undefined }))
      })
    })
  }

  download(url: string, path: string, options: DownloadOptions = {}): Promise<DownloadResult> {
    return new Promise((resolve, reject) => {
      const signal = options.signal

      let info: NetResponseInfo = { status: 0, statusText: "", url, headers: {} }
      let received = 0
      let total: number | null = null
      let resumed = false
      let responded = false
      let settled = false
      let request: NetRequest | null = null
      let failure: Error | null = null
      let chain: Promise<unknown> = Promise.resolve()

      const headers: Record<string, string> = { ...(options.headers ?? {}) }

      const settle = (finish: () => void): void => {
        if (settled) return

        settled = true
        signal?.removeEventListener("abort", onAbort)
        finish()
      }

      const abortedError = (): NetError => {
        return new NetError("ERR_ABORTED", "download aborted", { url, connected: responded ? true : undefined })
      }

      // The host may keep sending for a moment after abort(), so the file is removed once writes have settled.
      const discardPartial = async (): Promise<void> => {
        await chain

        if (options.resume) return

        try {
          await fs.remove(path)
        } catch {
          // Nothing to remove when the file was never created.
        }
      }

      const onAbort = (): void => {
        if (settled) return

        settled = true
        request?.abort()

        void discardPartial().then(() => reject(abortedError()))
      }

      if (signal?.aborted) {
        reject(abortedError())

        return
      }

      signal?.addEventListener("abort", onAbort, { once: true })

      const prepare = options.resume
        ? fs.exists(path).then(async (exists) => {
            if (!exists) return

            const stat = await fs.stat(path)

            if (stat.size <= 0) return

            resumed = true
            received = stat.size
            headers.Range = `bytes=${stat.size}-`
          })
        : fs.writeFile(path, "", "utf8").then(() => undefined)

      // An abort during the preparation still has to wait for the file it creates.
      chain = prepare.catch(() => undefined)

      prepare
        .then(() => {
          if (settled) return

          const current = this.request(url, {
            method: "GET",
            headers,
            timeoutMs: options.timeoutMs,
            responseType: "binary",
            maxBytes: 0,
          })

          request = current

          const track = (work: Promise<unknown>): void => {
            chain = chain
              .then(() => work)
              .catch((error) => {
                failure ??= error instanceof Error ? error : new Error(String(error))
              })
          }

          current.on("response", (value) => {
            if (settled) return

            info = value
            responded = true

            const length = Number(value.headers["content-length"] ?? value.headers["Content-Length"])
            const offset = value.status === 206 ? received : 0

            if (options.throwOnError && value.status >= 400) {
              current.abort()
              settle(() => {
                void discardPartial().then(() => {
                  reject(
                    new NetError("HTTP_STATUS", value.statusText || "request failed", { url, status: value.status }),
                  )
                })
              })

              return
            }

            total = Number.isFinite(length) ? length + offset : null

            if (resumed && value.status !== 206) {
              received = 0
              resumed = false
            }

            if (options.resume && value.status !== 206) track(fs.writeFile(path, "", "utf8"))

            options.onProgress?.(received, total)
          })

          current.on("data", (chunk) => {
            if (settled) return

            const bytes = typeof chunk === "string" ? textBytes(chunk) : chunk

            received += bytes.byteLength

            track(fs.appendBytes(path, bytes))
            options.onProgress?.(received, total)
          })

          current.on("end", () => {
            if (settled) return

            settle(() => {
              void chain.then(() => {
                if (failure) {
                  reject(failure)

                  return
                }

                resolve({ ...info, path, bytes: received, resumed })
              })
            })
          })

          current.on("error", (error) => {
            settle(() => {
              reject(new NetError(error.code, error.message, { url, connected: responded ? true : undefined }))
            })
          })
        })
        .catch((error) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))))
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
  download: (url: string, path: string, options?: DownloadOptions): Promise<DownloadResult> =>
    client.download(url, path, options),
  websocket: (url: string, options?: WebSocketOptions): NetWebSocket => client.websocket(url, options),
  abort: (id: number): void => client.abortRequest(id),
}

export const netInternals = {
  install: (transport: NetTransport, guard: (name: string) => void): void => client.install(transport, guard),
  handleMessage: (message: unknown): boolean => client.handleMessage(message),
  handleData: (id: number, data: Uint8Array): void => client.handleData(id, data),
}
