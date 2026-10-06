export interface AppConfig {
  ui: string
  width?: number
  height?: number
  title?: string
}

export type EventHandler = (payload: any) => void

export class Store {
  private readonly data = new Map<string, unknown>()
  private readonly dirty = new Set<string>()
  private readonly removed = new Set<string>()

  get(key: string): unknown {
    return this.data.has(key) ? this.data.get(key) : null
  }

  set(key: string, value: unknown): this {
    const existed = this.data.has(key)
    if (!existed || !Object.is(this.data.get(key), value)) {
      this.dirty.add(key)
      this.removed.delete(key)
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

  constructor(config: AppConfig) {
    this.config = config
    this.store = new Store()
    App.current = this
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
