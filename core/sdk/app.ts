import { callCapability } from "./caps.ts"
import { loadManifest, resolveWindows, type AppManifest } from "./manifest.ts"

export interface AppConfig {
  ui: string
  /** Window label; addresses windows in multi-window apps. */
  label?: string
  width?: number
  height?: number
  title?: string
  /** Stable identifier used for per-app data/config/cache directories. */
  id?: string
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  resizable?: boolean
  frameless?: boolean
  /** Path to the window/app icon. */
  icon?: string
}

export type EventHandler = (payload: never) => void

/** Payloads of the lifecycle/UI events the host and tray emit. */
export interface PulsarEventMap {
  "window-close": { label?: string }
  "window-all-closed": Record<string, never>
  "window-resize": { label: string; width: number; height: number }
  "window-move": { label: string; x: number; y: number }
  "window-state": { label: string; state: "normal" | "minimized" | "maximized" | "fullscreen" }
  "window-focus": { label: string }
  "window-blur": { label: string }
  "window-show": { label: string }
  "window-hide": { label: string }
  log: { level: string; source: "qml" | "js"; message: string; file?: string; line?: number }
  "tray-menu": { event?: string }
  "tray-activated": { reason?: number }
}

export type KnownEvent = keyof PulsarEventMap

interface StoreIssue {
  path: string
  reason: string
}

/**
 * Only JSON-serializable values are allowed in the store: plain objects,
 * arrays, strings, finite numbers, booleans and null. Anything else is
 * rejected loudly instead of being silently mangled by JSON.stringify.
 *
 * Returns a description of the first problem found, or null when valid.
 */
function findStoreIssue(value: unknown, path: string, seen: Set<object>): StoreIssue | null {
  if (value === null) return null
  switch (typeof value) {
    case "string":
    case "boolean":
      return null
    case "number":
      return Number.isFinite(value) ? null : { path, reason: `is not a finite number (${value})` }
    case "undefined":
      return { path, reason: "is undefined; use store.delete(key) instead" }
    case "bigint":
      return { path, reason: "is a bigint; convert it to a string" }
    case "function":
    case "symbol":
      return { path, reason: `is a ${typeof value}, which cannot be serialized` }
    case "object": {
      const obj = value as object
      if (seen.has(obj)) return { path, reason: "contains a circular reference" }
      if (Array.isArray(obj)) {
        seen.add(obj)
        for (let i = 0; i < obj.length; i++) {
          const issue = findStoreIssue(obj[i], `${path}[${i}]`, seen)
          if (issue) return issue
        }
        seen.delete(obj)
        return null
      }
      const proto = Object.getPrototypeOf(obj)
      if (proto !== Object.prototype && proto !== null) {
        const name = obj.constructor?.name ?? "object"
        return {
          path,
          reason: `is a ${name}; only plain objects and arrays are supported (pass file URLs, not binary data)`,
        }
      }
      seen.add(obj)
      for (const [key, child] of Object.entries(obj)) {
        const issue = findStoreIssue(child, `${path}.${key}`, seen)
        if (issue) return issue
      }
      seen.delete(obj)
      return null
    }
  }
  return null
}

export function assertSerializable(value: unknown, key: string) {
  const issue = findStoreIssue(value, key, new Set())
  if (issue) throw new Error(`store.set("${key}"): value at "${issue.path}" ${issue.reason}`)
}

export class Store {
  private readonly data = new Map<string, unknown>()
  private readonly dirty = new Set<string>()
  private readonly removed = new Set<string>()

  /** Called whenever the store changes; the runtime uses it to push updates. */
  onChange?: () => void

  get(key: string): unknown {
    return this.data.has(key) ? this.data.get(key) : null
  }

  set(key: string, value: unknown): this {
    assertSerializable(value, key)
    const existed = this.data.has(key)
    if (!existed || !Object.is(this.data.get(key), value)) {
      this.dirty.add(key)
      this.removed.delete(key)
      this.onChange?.()
    }
    this.data.set(key, value)
    return this
  }

  has(key: string): boolean {
    return this.data.has(key)
  }

  delete(key: string): boolean {
    const had = this.data.delete(key)
    if (had) {
      this.removed.add(key)
      this.dirty.delete(key)
      this.onChange?.()
    }
    return had
  }

  keys(): string[] {
    return [...this.data.keys()]
  }

  /** Full state. Used once on the initial __sync. */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.data)
  }

  /** Keys changed/removed since the last call; clears the tracking. */
  takePatch(): { changed: Record<string, unknown>; removed: string[] } {
    const changed: Record<string, unknown> = {}
    for (const key of this.dirty) changed[key] = this.data.get(key)
    const removed = [...this.removed]
    this.dirty.clear()
    this.removed.clear()
    return { changed, removed }
  }
}

/** Controls a single window declared in pulsar.json, addressed by label. */
export class WindowHandle {
  constructor(readonly label: string) {}

  private command(action: string, extra: Record<string, unknown> = {}): Promise<boolean> {
    return callCapability("window", { label: this.label, action, ...extra }) as Promise<boolean>
  }

  /** Send an event to just this window's UI (handled by Pulsar.on in QML). */
  emit(event: string, payload?: unknown): void {
    App.current?.send(event, payload, this.label)
  }

  show(): Promise<boolean> {
    return this.command("show")
  }
  hide(): Promise<boolean> {
    return this.command("hide")
  }
  close(): Promise<boolean> {
    return this.command("close")
  }
  /** Close and drop the window (frees its QML UI); recreate it with createWindow. */
  destroy(): Promise<boolean> {
    return this.command("destroy")
  }
  focus(): Promise<boolean> {
    return this.command("focus")
  }
  minimize(): Promise<boolean> {
    return this.command("minimize")
  }
  maximize(): Promise<boolean> {
    return this.command("maximize")
  }
  restore(): Promise<boolean> {
    return this.command("restore")
  }
  setTitle(title: string): Promise<boolean> {
    return this.command("setTitle", { title })
  }
  setSize(width: number, height: number): Promise<boolean> {
    return this.command("setSize", { width, height })
  }
  setPosition(x: number, y: number): Promise<boolean> {
    return this.command("setPosition", { x, y })
  }
  setFullscreen(value: boolean): Promise<boolean> {
    return this.command("fullscreen", { value })
  }
  setAlwaysOnTop(value: boolean): Promise<boolean> {
    return this.command("alwaysOnTop", { value })
  }
}

export class App {
  static current: App | null = null

  readonly store: Store
  /** The pulsar.json this app was created from, if any. */
  readonly manifest: AppManifest | null

  private readonly windowConfigs: AppConfig[]
  private readonly events = new Map<string, EventHandler[]>()

  /** Installed by the runtime; terminates the host. */
  onQuit?: () => void
  /** Installed by the runtime; sends an app event to the UI. */
  onSend?: (event: string, payload: unknown, target: string) => void
  /** Installed by the runtime; asks the host to create a window. */
  onCreateWindow?: (config: AppConfig) => void

  /** The windows currently open (start windows plus those created in code). */
  get windows(): AppConfig[] {
    return this.windowConfigs
  }

  /** The first window, for convenience. */
  get config(): AppConfig {
    return this.windowConfigs[0]!
  }

  constructor(config: Partial<AppConfig> = {}) {
    this.manifest = loadManifest()
    this.windowConfigs = resolveWindows(this.manifest, config)
    this.store = new Store()
    App.current = this
  }

  /** Quit the application. */
  quit(): void {
    this.onQuit?.()
  }

  /** Handle for a window (defaults to the first). */
  window(label = this.config.label ?? "main"): WindowHandle {
    return new WindowHandle(label)
  }

  /** Create a window at runtime; returns a handle to control it. */
  createWindow(config: AppConfig): WindowHandle {
    const label = config.label ?? this.nextWindowLabel()
    const resolved: AppConfig = { ...config, label, ui: config.ui ?? "ui/main.qml" }
    const index = this.windowConfigs.findIndex((w) => w.label === label)

    if (index >= 0) this.windowConfigs[index] = resolved
    else this.windowConfigs.push(resolved)

    this.onCreateWindow?.(resolved)
    return new WindowHandle(label)
  }

  /** Close the window with this label (defaults to the first). */
  closeWindow(label = this.config.label ?? "main"): Promise<boolean> {
    return new WindowHandle(label).close()
  }

  /** Send an event to the UI. `target` is a window label, or "*" for all. */
  send(event: string, payload?: unknown, target = "*"): void {
    this.onSend?.(event, payload ?? null, target)
  }

  /**
   * Register a handler for an event from QML (`Pulsar.emit`), the host
   * (window/tray lifecycle) or the backend (`app.send`).
   */
  on<E extends KnownEvent>(event: E, fn: (payload: PulsarEventMap[E]) => void): this
  on<P = unknown>(event: string, fn: (payload: P) => void): this
  on(event: string, fn: EventHandler): this {
    const list = this.events.get(event) ?? []
    list.push(fn)
    this.events.set(event, list)
    return this
  }

  /** Show the window and start the app. The host owns the event loop. */
  run(): void {}

  private nextWindowLabel(): string {
    const used = new Set(this.windowConfigs.map((w) => w.label))
    let n = this.windowConfigs.length + 1
    while (used.has(`window-${n}`)) n++
    return `window-${n}`
  }

  // --- internal API used by the runtime ---

  hasEvent(event: string): boolean {
    return this.events.has(event)
  }

  dispatchEvent(event: string, payload: unknown): void {
    for (const fn of this.events.get(event) ?? []) fn(payload as never)
  }
}
