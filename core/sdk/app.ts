export interface AppConfig {
  ui: string;
  width?: number;
  height?: number;
  title?: string;
}

export type Handler = (params: any) => unknown | Promise<unknown>;
export type EventHandler = (data: any) => void;

export class Store {
  private readonly data = new Map<string, unknown>();

  constructor(private readonly app: App) {}

  get(key: string): unknown {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  set(key: string, value: unknown): this {
    this.data.set(key, value);
    this.app.notifyStore(key, value);
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
}

export class App {
  static current: App | null = null;

  readonly config: AppConfig;
  readonly store: Store;

  private readonly handlers = new Map<string, Handler>();
  private readonly events = new Map<string, EventHandler[]>();

  constructor(config: AppConfig) {
    this.config = config;
    this.store = new Store(this);
    App.current = this;
  }

  /** Register a request/response handler callable from QML via Pulsar.call(name, ...). */
  handle(name: string, fn: Handler): this {
    this.handlers.set(name, fn);
    return this;
  }

  /** Register a handler for an event emitted from QML via Pulsar.emit(event, ...). */
  on(event: string, fn: EventHandler): this {
    const list = this.events.get(event) ?? [];
    list.push(fn);
    this.events.set(event, list);
    return this;
  }

  /** Send an event to the UI. TODO(M3): requires the event channel. */
  emit(event: string, data?: unknown): void {
    void event;
    void data;
  }

  /** Show the window and start the app. The host owns the event loop. */
  run(): void {}

  // --- internal API used by the runtime ---

  resolve(name: string): Handler | undefined {
    return this.handlers.get(name);
  }

  dispatchEvent(event: string, data: unknown): void {
    for (const fn of this.events.get(event) ?? []) fn(data);
  }

  notifyStore(_key: string, _value: unknown): void {
    // TODO(M3): push store updates to the UI once the event channel exists.
  }
}
