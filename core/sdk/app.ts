export interface AppConfig {
  ui: string
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

export type EventHandler = (payload: any) => void

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

export class App {
  static current: App | null = null

  readonly config: AppConfig
  readonly store: Store

  private readonly events = new Map<string, EventHandler[]>()

  /** Installed by the runtime; terminates the host. */
  onQuit?: () => void

  constructor(config: AppConfig) {
    this.config = config
    this.store = new Store()
    App.current = this
  }

  /** Quit the application. */
  quit(): void {
    this.onQuit?.()
  }

  /** Register a handler for an event emitted from QML via Pulsar.emit(event, payload). */
  on(event: string, fn: EventHandler): this {
    const list = this.events.get(event) ?? []
    list.push(fn)
    this.events.set(event, list)
    return this
  }

  /** Show the window and start the app. The host owns the event loop. */
  run(): void {}

  // --- internal API used by the runtime ---

  hasEvent(event: string): boolean {
    return this.events.has(event)
  }

  dispatchEvent(event: string, payload: unknown): void {
    for (const fn of this.events.get(event) ?? []) fn(payload)
  }
}
