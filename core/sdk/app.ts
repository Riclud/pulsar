import { callCapability } from "./caps.ts"
import { loadManifest, resolveWindows, type AppManifest } from "./manifest.ts"
import { Source } from "./reactive.ts"
import { shortcutInternals } from "./shortcuts.ts"
import {
  collectUiHandlers,
  createUiRoot,
  diffUiTrees,
  disposeUiRoot,
  forgetHandlers,
  invalidateUiRoot,
  reconcileUiRoot,
  renderUiRoot,
  runPendingMounts,
  serialize,
  setUiCommandSink,
  setWindowHandlers,
  uiRootNodes,
  updateUiRoot,
  type UiCommand,
  type UiHandlerChange,
  type UiNode,
  type UiPatch,
  type UiRoot,
  type UiRoutes,
} from "./ui.ts"

export type UiSource = UiNode | UiNode[] | (() => UiNode | UiNode[])

export interface AppConfig {
  /** QML file for this window; omit it to render the window from a JS tree. */
  ui?: string
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
  /** Transparent window background (compositor blur/rounding can apply). */
  transparent?: boolean
  /** Path to the window/app icon. */
  icon?: string
}

export interface MenuItem {
  /** Event id reported in the `menu` event when the item is chosen. */
  id?: string
  label?: string
  /** Draw a separator instead of an item. */
  separator?: boolean
  enabled?: boolean
  checked?: boolean
  /** For example "Ctrl+S" or "CmdOrCtrl+S". */
  shortcut?: string
  /** Submenu items. A top-level item without `items` is ignored. */
  items?: MenuItem[]
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
  "app-pause": { state: "inactive" | "suspended" }
  "app-resume": Record<string, never>
  "app-stop": Record<string, never>
  "back-pressed": Record<string, never>
  log: { level: string; source: "qml" | "js"; message: string; file?: string; line?: number }
  "tray-menu": { event?: string }
  "tray-activated": { reason?: number }
  "theme-changed": { scheme: "light" | "dark" }
  "power-suspend": Record<string, never>
  "power-resume": Record<string, never>
  "power-source": { onBattery: boolean }
  menu: { id: string }
  "notification-click": { token: string }
  "notification-action": { token: string; id: string }
  "open-file": { path: string }
  "open-url": { url: string }
  share: { text?: string; files?: string[]; url?: string }
  "second-instance": { argv: string[]; cwd: string }
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
const findStoreIssue = (value: unknown, path: string, seen: Set<object>): StoreIssue | null => {
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
    case "object":
      return findObjectIssue(value as object, path, seen)
  }

  return null
}

const findArrayIssue = (obj: unknown[], path: string, seen: Set<object>): StoreIssue | null => {
  seen.add(obj)

  for (let i = 0; i < obj.length; i++) {
    const issue = findStoreIssue(obj[i], `${path}[${i}]`, seen)

    if (issue) return issue
  }

  seen.delete(obj)

  return null
}

const findEntryIssue = (obj: object, path: string, seen: Set<object>): StoreIssue | null => {
  seen.add(obj)

  for (const [key, child] of Object.entries(obj)) {
    const issue = findStoreIssue(child, `${path}.${key}`, seen)

    if (issue) return issue
  }

  seen.delete(obj)

  return null
}

const findObjectIssue = (obj: object, path: string, seen: Set<object>): StoreIssue | null => {
  if (seen.has(obj)) return { path, reason: "contains a circular reference" }
  if (Array.isArray(obj)) return findArrayIssue(obj, path, seen)

  const proto = Object.getPrototypeOf(obj)

  if (proto !== Object.prototype && proto !== null) {
    const name = obj.constructor?.name ?? "object"

    return {
      path,
      reason: `is a ${name}; only plain objects and arrays are supported (pass file URLs, not binary data)`,
    }
  }

  return findEntryIssue(obj, path, seen)
}

export const assertSerializable = (value: unknown, key: string): void => {
  const issue = findStoreIssue(value, key, new Set())

  if (issue) throw new Error(`store.set("${key}"): value at "${issue.path}" ${issue.reason}`)
}

export interface UiTimings {
  label: string
  build: number
  serialize: number
  handlers: number
  diff: number
  /** Encoding and delivery; on the embedded host this includes applying the patch in QML. */
  send: number
  /** Patches sent, or -1 for a full tree. */
  patches: number
}

/**
 * The node IDs the host currently shows. IDs are small increasing integers, so
 * flags in a typed array replace a hash set: replacing the whole set costs a
 * few array writes per ID instead of hashing every one.
 */
class SentIDs {
  private live = new Uint8Array(1024)
  private marks = new Int32Array(1024)
  private list: number[] = []
  private epoch = 0

  private grow(id: number): void {
    if (id < this.live.length) return

    const size = Math.max(id + 1, this.live.length * 2)
    const live = new Uint8Array(size)
    const marks = new Int32Array(size)

    live.set(this.live)
    marks.set(this.marks)
    this.live = live
    this.marks = marks
  }

  add(id: number): void {
    this.grow(id)

    if (this.live[id]) return

    this.live[id] = 1
    this.list.push(id)
  }

  delete(id: number): void {
    if (id < this.live.length) this.live[id] = 0
  }

  /** Make `next` the whole set and return the IDs that were in it before. */
  replace(next: number[]): number[] {
    const epoch = ++this.epoch
    const gone: number[] = []

    for (const id of next) {
      this.grow(id)
      this.marks[id] = epoch
    }

    for (const id of this.list) {
      if (!this.live[id] || this.marks[id] === epoch) continue

      this.live[id] = 0
      gone.push(id)
    }

    for (const id of next) this.live[id] = 1

    this.list = next

    return gone
  }
}

const clock = (): number => {
  return typeof performance === "undefined" ? Date.now() : performance.now()
}

export class Store {
  private readonly data = new Map<string, unknown>()
  private readonly sources = new Map<string, Source>()
  private readonly keysSource = new Source()
  private readonly dirty = new Set<string>()
  private readonly removed = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private batching = 0
  private pendingNotify = false

  /** Called whenever the store changes; the runtime uses it to push updates. */
  onChange?: () => void

  /** Subscribe to any change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  /** Run several mutations and notify listeners once, after the last one. */
  batch<T>(fn: () => T): T {
    this.batching++

    try {
      return fn()
    } finally {
      this.batching--

      if (this.batching === 0 && this.pendingNotify) {
        this.pendingNotify = false
        this.notify()
      }
    }
  }

  private notify(): void {
    this.onChange?.()
    for (const listener of this.listeners) listener()
  }

  private requestNotify(): void {
    if (this.batching > 0) {
      this.pendingNotify = true

      return
    }

    this.notify()
  }

  private sourceOf(key: string): Source {
    const existing = this.sources.get(key)

    if (existing) return existing

    const source = new Source()

    this.sources.set(key, source)

    return source
  }

  get(key: string): unknown {
    this.sourceOf(key).track()

    return this.data.has(key) ? this.data.get(key) : null
  }

  set(key: string, value: unknown): this {
    assertSerializable(value, key)

    const existed = this.data.has(key)

    if (existed && Object.is(this.data.get(key), value)) return this

    this.data.set(key, value)
    this.dirty.add(key)
    this.removed.delete(key)
    this.sourceOf(key).trigger()

    if (!existed) this.keysSource.trigger()

    this.requestNotify()

    return this
  }

  has(key: string): boolean {
    this.sourceOf(key).track()

    return this.data.has(key)
  }

  delete(key: string): boolean {
    const had = this.data.delete(key)

    if (had) {
      this.removed.add(key)
      this.dirty.delete(key)
      this.sourceOf(key).trigger()
      this.keysSource.trigger()
      this.requestNotify()
    }

    return had
  }

  keys(): string[] {
    this.keysSource.track()

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

  /** Render a JS-built UI tree into this window (windows declared without `ui`). */
  render(source: UiSource): void {
    App.current?.renderWindow(this.label, source)
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
  /** Installed by the runtime; renders a JS UI tree into a window. */
  /** Receives the cost of each UI flush, in milliseconds. */
  onUiTimings?: (timings: UiTimings) => void
  onSendUi?: (label: string, tree: unknown[]) => void
  /** Installed by the runtime; applies changed subtrees to an existing window. */
  onSendUiPatch?: (label: string, patches: UiPatch[]) => void
  /** Installed by the runtime; moves a rendered node, such as a scroll, from code. */
  onUiCommand?: (command: UiCommand) => void
  /** Installed by the runtime; adds a file to the OS recent list. */
  onAddRecentDocument?: (path: string) => void
  /** Installed by the runtime; clears the OS recent list. */
  onClearRecentDocuments?: () => void
  /** Installed by the runtime; builds the native menu bar. */
  onSetMenu?: (items: MenuItem[]) => void

  private readonly roots = new Map<string, UiRoot>()
  private readonly sentTrees = new Map<string, unknown[]>()
  private readonly sentRoutes = new Map<string, UiRoutes>()
  private readonly sentIds = new Map<string, SentIDs>()
  private readonly pendingRecent: Array<{ action: "add" | "clear"; path?: string }> = []
  private lastMenu: MenuItem[] | null = null
  private flushQueued = false

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
    setUiCommandSink((command) => this.onUiCommand?.(command))
    this.on("shortcut", (data) => shortcutInternals.run(Number((data as { id?: number }).id)))
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
    const resolved: AppConfig = {
      ...config,
      label,
      ui: config.ui ?? (this.roots.has(label) ? "" : "ui/main.qml"),
    }

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

  /** Add a file to the OS recent-documents list. */
  addRecentDocument(path: string): void {
    if (!this.onAddRecentDocument) {
      this.pendingRecent.push({ action: "add", path })

      return
    }

    this.onAddRecentDocument(path)
  }

  /** Clear the OS recent-documents list. */
  clearRecentDocuments(): void {
    if (!this.onClearRecentDocuments) {
      this.pendingRecent.push({ action: "clear" })

      return
    }

    this.onClearRecentDocuments()
  }

  /**
   * Replace the application menu. Call it again after changing `checked`
   * states; choosing an item emits the `menu` event with its id. Native menu
   * bars are only supported on macOS; other platforms ignore the call.
   */
  setMenu(items: MenuItem[]): void {
    this.lastMenu = items
    this.onSetMenu?.(items)
  }

  /** Re-send the menu after the runtime wires its handler. */
  flushMenu(): void {
    if (this.lastMenu) this.onSetMenu?.(this.lastMenu)
  }

  /** Flush recent-document calls made before the runtime wired its handlers. */
  flushRecentDocuments(): void {
    for (const op of this.pendingRecent.splice(0)) {
      if (op.action === "add") this.onAddRecentDocument?.(op.path ?? "")
      else this.onClearRecentDocuments?.()
    }
  }

  /** Render a JS-built UI tree into the window with this label. */
  renderWindow(label: string, source: UiSource): void {
    const previous = this.roots.get(label)

    if (previous) disposeUiRoot(previous)

    this.roots.set(
      label,
      createUiRoot(
        () => {
          const value = typeof source === "function" ? source() : source

          return Array.isArray(value) ? value : [value]
        },
        () => this.queueFlush(),
      ),
    )

    this.sentTrees.delete(label)
    this.sentRoutes.delete(label)
    this.sentIds.delete(label)

    this.flushUi(label)
    runPendingMounts()
  }

  /** Rerender every component, for state that signals and the store cannot see. */
  invalidateUi(): void {
    for (const root of this.roots.values()) invalidateUiRoot(root)
  }

  private queueFlush(): void {
    if (this.flushQueued) return

    this.flushQueued = true

    queueMicrotask(() => {
      this.flushQueued = false
      this.flushAllUi()
    })
  }

  /** Flush every pending UI tree to the host (called once wired). */
  flushAllUi(): void {
    for (const label of this.roots.keys()) this.flushUi(label)

    runPendingMounts()
  }

  private flushUi(label: string): void {
    const root = this.roots.get(label)

    if (!root || !this.onSendUi) return

    const previous = this.sentTrees.get(label)
    const started = this.onUiTimings ? clock() : 0

    if (previous && this.onSendUiPatch && !root.instance.dirty) {
      this.flushChanges(label, root, started)

      return
    }

    this.flushRoot(label, root, previous, started)
  }

  private flushChanges(label: string, root: UiRoot, started: number): void {
    if (root.dirty.size === 0) return

    const update = updateUiRoot(root)

    if (!update) {
      this.flushRoot(label, root, this.sentTrees.get(label), started)

      return
    }

    this.applyHandlerChange(label, update)

    const rendered = this.onUiTimings ? clock() : 0

    if (update.patches.length > 0) this.onSendUiPatch?.(label, update.patches)

    this.onUiTimings?.({
      label,
      build: rendered - started,
      serialize: 0,
      handlers: 0,
      diff: 0,
      send: clock() - rendered,
      patches: update.patches.length,
    })
  }

  private applyHandlerChange(label: string, update: UiHandlerChange): void {
    const routes = this.sentRoutes.get(label) ?? {}
    const ids = this.sentIds.get(label) ?? new SentIDs()

    // A rerendered component keeps the nodes of children that did not change, so
    // their IDs show up as both removed and current; only drop the ones now gone.
    const current = new Set(update.ids)
    const gone = update.removedIDs.filter((id) => !current.has(id))

    for (const path of update.removedRoutes) delete routes[path]
    for (const id of gone) ids.delete(id)

    forgetHandlers(gone)
    Object.assign(routes, update.routes)

    for (const id of update.ids) ids.add(id)
  }

  private flushRoot(label: string, root: UiRoot, previous: unknown[] | undefined, started: number): void {
    const report = this.onUiTimings
    const before = previous && this.onSendUiPatch ? uiRootNodes(root) : null
    const nodes = renderUiRoot(root)
    const built = report ? clock() : 0
    const tree = serialize(nodes)
    const serialized = report ? clock() : 0
    const knownRoutes = this.sentRoutes.get(label)
    const knownIDs = this.sentIds.get(label)

    if (before && knownRoutes && knownIDs) {
      this.applyHandlerChange(label, reconcileUiRoot(before, nodes))
    } else {
      const { routes, ids } = collectUiHandlers(nodes)
      const sent = knownIDs ?? new SentIDs()

      forgetHandlers(sent.replace(ids))
      setWindowHandlers(label, routes)

      this.sentRoutes.set(label, routes)
      this.sentIds.set(label, sent)
    }

    const collected = report ? clock() : 0

    this.sentTrees.set(label, tree)

    const patches = previous && this.onSendUiPatch ? diffUiTrees(previous, tree) : null
    const diffed = report ? clock() : 0

    if (patches === null) this.onSendUi?.(label, tree)
    else if (patches.length > 0) this.onSendUiPatch?.(label, patches)

    report?.({
      label,
      build: built - started,
      serialize: serialized - built,
      handlers: collected - serialized,
      diff: diffed - collected,
      send: clock() - diffed,
      patches: patches?.length ?? -1,
    })
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
