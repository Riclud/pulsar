export interface AppConfig {
  ui: string;
  width?: number;
  height?: number;
  title?: string;
}

export type EventHandler = (payload: any) => void;

export class Store {
  private readonly data = new Map<string, unknown>();

  get(key: string): unknown {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  set(key: string, value: unknown): this {
    this.data.set(key, value);
    return this;
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): boolean {
    return this.data.delete(key);
  }

  keys(): string[] {
    return [...this.data.keys()];
  }

  /** Plain object with all current state, pushed to the UI after each emit. */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }
}

export class App {
  static current: App | null = null;

  readonly config: AppConfig;
  readonly store: Store;

  private readonly events = new Map<string, EventHandler[]>();

  constructor(config: AppConfig) {
    this.config = config;
    this.store = new Store();
    App.current = this;
  }

  /** Register a handler for an event emitted from QML via Pulsar.emit(event, payload). */
  on(event: string, fn: EventHandler): this {
    const list = this.events.get(event) ?? [];
    list.push(fn);
    this.events.set(event, list);
    return this;
  }

  /** Show the window and start the app. The host owns the event loop. */
  run(): void {}

  // --- internal API used by the runtime ---

  hasEvent(event: string): boolean {
    return this.events.has(event);
  }

  dispatchEvent(event: string, payload: unknown): void {
    for (const fn of this.events.get(event) ?? []) fn(payload);
  }
}
