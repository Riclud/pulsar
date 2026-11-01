import type { AppPaths, FileStat, FsEncoding } from "../platform.ts"

export type { AppPaths, FileStat, FsEncoding } from "../platform.ts"

export type CapHandler = (params: never) => Promise<unknown>
export type CapRegistry = Record<string, CapHandler>

// Handlers are installed by the runtime so that calls made from the app and
// from QML go through the same registry.
const capabilities: CapRegistry = {}

/** Register a single capability handler. */
export const registerCapability = (name: string, handler: CapHandler): void => {
  capabilities[name] = handler
}

/** Register a batch of capability handlers. */
export const registerCapabilities = (caps: CapRegistry): void => {
  Object.assign(capabilities, caps)
}

/** Whether a capability with this name is registered. */
export const hasCapability = (name: string): boolean => {
  return name in capabilities
}

/** Names of all registered capabilities. */
export const listCapabilities = (): string[] => {
  return Object.keys(capabilities)
}

let permissionGate: ((name: string) => void) | null = null

/** Install the manifest permission gate; null disables it (everything allowed). */
export const setPermissionGate = (gate: ((name: string) => void) | null): void => {
  permissionGate = gate
}

/** Throw when a capability is not permitted (for APIs that bypass callCapability). */
export const assertCapability = (name: string): void => {
  permissionGate?.(name)
}

/** Invoke a capability by name. Rejects if it is not registered or not permitted. */
export const callCapability = (name: string, params?: unknown): Promise<unknown> => {
  const handler = capabilities[name]

  if (!handler) return Promise.reject(new Error(`unknown capability: ${name}`))

  if (permissionGate) {
    try {
      permissionGate(name)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  const invoke = handler as (params: unknown) => Promise<unknown>

  return invoke(params ?? {})
}

const watchListeners = new Map<string, Set<(path: string) => void>>()

/** Used by the runtime to deliver `fs-change` events. */
export const fsWatchInternals = {
  notify: (path: string): void => {
    for (const listener of watchListeners.get(path) ?? []) listener(path)
  },
}

/** Built-in filesystem capabilities. */
export const fs = {
  readFile: (path: string, encoding: FsEncoding = "utf8"): Promise<string> =>
    callCapability("fs.readFile", { path, encoding }) as Promise<string>,
  writeFile: (path: string, content: string, encoding: FsEncoding = "utf8"): Promise<boolean> =>
    callCapability("fs.writeFile", { path, content, encoding }) as Promise<boolean>,
  appendFile: (path: string, content: string, encoding: FsEncoding = "utf8"): Promise<boolean> =>
    callCapability("fs.appendFile", { path, content, encoding }) as Promise<boolean>,
  listDir: (path?: string): Promise<string[]> => callCapability("fs.listDir", { path }) as Promise<string[]>,
  exists: (path: string): Promise<boolean> => callCapability("fs.exists", { path }) as Promise<boolean>,
  stat: (path: string): Promise<FileStat> => callCapability("fs.stat", { path }) as Promise<FileStat>,
  mkdir: (path: string, recursive = true): Promise<boolean> =>
    callCapability("fs.mkdir", { path, recursive }) as Promise<boolean>,
  remove: (path: string, recursive = false): Promise<boolean> =>
    callCapability("fs.remove", { path, recursive }) as Promise<boolean>,
  rename: (from: string, to: string): Promise<boolean> => callCapability("fs.rename", { from, to }) as Promise<boolean>,
  copy: (from: string, to: string, recursive = true): Promise<boolean> =>
    callCapability("fs.copy", { from, to, recursive }) as Promise<boolean>,
  moveToTrash: (path: string): Promise<boolean> => callCapability("fs.moveToTrash", { path }) as Promise<boolean>,
  exportTo: (path: string, name?: string): Promise<boolean> =>
    callCapability("fs.exportTo", { path, name }) as Promise<boolean>,
  open: (path: string): Promise<boolean> => callCapability("fs.open", { path }) as Promise<boolean>,
  /**
   * Watch a file or directory; `listener` runs after each change. Returns an
   * unsubscribe function. Watches are reference-counted per path.
   */
  watch: (path: string, listener: (path: string) => void): (() => void) => {
    const listeners = watchListeners.get(path) ?? new Set<(value: string) => void>()
    const first = listeners.size === 0

    listeners.add(listener)
    watchListeners.set(path, listeners)

    if (first) void callCapability("fs.watch", { path })

    return () => {
      const current = watchListeners.get(path)

      if (!current) return

      current.delete(listener)

      if (current.size > 0) return

      watchListeners.delete(path)
      void callCapability("fs.unwatch", { path })
    }
  },
}


/** Standard per-OS directories the app is allowed to write to. */
export const paths = {
  get: (): Promise<AppPaths> => callCapability("paths.get", {}) as Promise<AppPaths>,
}

export interface FileDialogOptions {
  title?: string
  /** Qt name filter, e.g. "Images (*.png *.jpg);;All files (*)". */
  filter?: string
  dir?: string
}

export interface MessageDialogOptions {
  title?: string
  text?: string
}

/** Native file and message dialogs (implemented in the Qt host). */
export const dialog = {
  openFile: (options: FileDialogOptions = {}): Promise<string | null> =>
    callCapability("dialog.openFile", options) as Promise<string | null>,
  openFiles: (options: FileDialogOptions = {}): Promise<string[]> =>
    callCapability("dialog.openFiles", options) as Promise<string[]>,
  openDirectory: (options: FileDialogOptions = {}): Promise<string | null> =>
    callCapability("dialog.openDirectory", options) as Promise<string | null>,
  saveFile: (options: FileDialogOptions = {}): Promise<string | null> =>
    callCapability("dialog.saveFile", options) as Promise<string | null>,
  message: (options: MessageDialogOptions = {}): Promise<boolean> =>
    callCapability("dialog.message", options) as Promise<boolean>,
  toast: (text: string): Promise<boolean> => callCapability("dialog.toast", { text }) as Promise<boolean>,
}

export interface TrayMenuItem {
  label?: string
  /** Event name emitted to the app when the item is clicked. */
  event?: string
  separator?: boolean
  checked?: boolean
  enabled?: boolean
}

/** System tray icon and menu (implemented in the Qt host). */
export const tray = {
  setIcon: (path: string): Promise<boolean> => callCapability("tray", { action: "setIcon", path }) as Promise<boolean>,
  setTooltip: (text: string): Promise<boolean> =>
    callCapability("tray", { action: "setTooltip", text }) as Promise<boolean>,
  setMenu: (items: TrayMenuItem[]): Promise<boolean> =>
    callCapability("tray", { action: "setMenu", items }) as Promise<boolean>,
  hide: (): Promise<boolean> => callCapability("tray", { action: "hide" }) as Promise<boolean>,
}

/** Open URLs and show desktop notifications via the OS shell. */
export const shell = {
  open: (url: string): Promise<boolean> => callCapability("shell.open", { url }) as Promise<boolean>,
  notify: (title: string, body?: string): Promise<string> =>
    callCapability("shell.notify", { title, body }) as Promise<string>,
}

/** Persist JSON-safe values to the app data directory (storage.json). */
export const storage = {
  get: (key: string): Promise<unknown> => callCapability("storage.get", { key }),
  has: (key: string): Promise<boolean> => callCapability("storage.has", { key }) as Promise<boolean>,
  set: (key: string, value: unknown): Promise<boolean> =>
    callCapability("storage.set", { key, value }) as Promise<boolean>,
  remove: (key: string): Promise<boolean> => callCapability("storage.remove", { key }) as Promise<boolean>,
}

/**
 * OS secret storage (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 * Entries are scoped to the app id and hold strings only. `available()` is
 * false when the platform backend is missing; fall back to `storage` then.
 */
export const secureStorage = {
  available: (): Promise<boolean> => callCapability("secure.available") as Promise<boolean>,
  get: (key: string): Promise<string | null> => callCapability("secure.get", { key }) as Promise<string | null>,
  set: (key: string, value: string): Promise<boolean> =>
    callCapability("secure.set", { key, value }) as Promise<boolean>,
  remove: (key: string): Promise<boolean> => callCapability("secure.remove", { key }) as Promise<boolean>,
}

export interface NotifyAction {
  id: string
  title: string
}

export interface NotifyOptions {
  title: string
  body?: string
  actions?: NotifyAction[]
}

/**
 * Native desktop notifications. Returns a token; when the user clicks the
 * notification the app gets a `notification-click` event carrying that token.
 * With `actions`, each button reports `notification-action` with the token and
 * the action id (Linux D-Bus only; other platforms show the plain body).
 */
export interface NotificationChannelOptions {
  id: string
  name?: string
  /** Android importance: 1 min, 2 low, 3 default, 4 high. */
  importance?: number
}

export const notify = {
  show: (options: NotifyOptions): Promise<string> => callCapability("shell.notify", options) as Promise<string>,
  /** Create (or reuse) an Android notification channel. */
  channel: (options: NotificationChannelOptions): Promise<boolean> =>
    callCapability("notification.channel", options) as Promise<boolean>,
}

export interface ScreenInfo {
  name: string
  x: number
  y: number
  width: number
  height: number
  workArea: { x: number; y: number; width: number; height: number }
  scale: number
  primary: boolean
}

/** Displays / monitors. */
export const screen = {
  list: (): Promise<ScreenInfo[]> => callCapability("screen.list") as Promise<ScreenInfo[]>,
  primary: async (): Promise<ScreenInfo | null> => {
    const screens = (await callCapability("screen.list")) as ScreenInfo[]

    return screens.find((s) => s.primary) ?? screens[0] ?? null
  },
}

export type ColorScheme = "light" | "dark"

export interface ThemePalette {
  background?: string
  surface?: string
  surfaceVariant?: string
  primary?: string
  text?: string
  textSecondary?: string
  border?: string
  radius?: number
  spacing?: number
}

export interface ThemeOptions {
  palette?: ThemePalette
  /** Custom named colors referenced from node props, e.g. { brand: "#ff5722" }. */
  colors?: Record<string, string>
  /** Multiplier for every font size (default 1). */
  fontScale?: number
  /** Multiplier for spacing and radii (default 1). */
  density?: number
}

/** System appearance; the app also gets a `theme-changed` event on switches. */
export const theme = {
  current: (): Promise<{ scheme: ColorScheme }> => callCapability("theme.get") as Promise<{ scheme: ColorScheme }>,
  /**
   * Override the built-in palette, font scale and density for every window.
   * Values are applied to the JS renderer and can be changed at runtime.
   */
  set: (options: ThemeOptions): Promise<boolean> => callCapability("theme.set", options) as Promise<boolean>,
}

export interface SystemLocale {
  locale: string
  language: string
  timezone: string
}

export interface PowerState {
  known: boolean
  source: "ac" | "battery" | "unknown"
  onBattery: boolean
  percent?: number
}

export const system = {
  locale: (): Promise<SystemLocale> => callCapability("system.locale") as Promise<SystemLocale>,
  power: (): Promise<PowerState> => callCapability("system.power") as Promise<PowerState>,
}

/** System clipboard. */
export const clipboard = {
  read: (): Promise<string> => callCapability("clipboard.read") as Promise<string>,
  write: (text: string): Promise<boolean> => callCapability("clipboard.write", { text }) as Promise<boolean>,
}

export type ShareKind = "text" | "url" | "file"

export interface ShareOptions {
  /** Dialog title / chooser label. */
  title?: string
  /** MIME type for shared files; guessed from the extension when omitted. */
  mime?: string
}

/** Hand content to the OS share sheet (Android) or clipboard (desktop). */
export const share = {
  text: (text: string, options: ShareOptions = {}): Promise<boolean> =>
    callCapability("share", { kind: "text", text, ...options }) as Promise<boolean>,
  url: (url: string, options: ShareOptions = {}): Promise<boolean> =>
    callCapability("share", { kind: "url", url, ...options }) as Promise<boolean>,
  file: (path: string, options: ShareOptions = {}): Promise<boolean> =>
    callCapability("share", { kind: "file", path, ...options }) as Promise<boolean>,
}

export type Orientation =
  | "auto"
  | "portrait"
  | "landscape"
  | "portrait-up"
  | "portrait-down"
  | "landscape-left"
  | "landscape-right"

/** Device controls that only have an effect on Android. */
export const device = {
  /** Lock or unlock the screen orientation. */
  setOrientation: (orientation: Orientation): Promise<boolean> =>
    callCapability("device.orientation", { orientation }) as Promise<boolean>,
  /** Keep the screen on while the app is foregrounded. */
  setKeepAwake: (enabled: boolean): Promise<boolean> =>
    callCapability("device.keepAwake", { enabled }) as Promise<boolean>,
}

export type OSPermission =
  | "camera"
  | "microphone"
  | "location"
  | "notifications"
  | "storage"

/**
 * Runtime OS permissions (camera, microphone, location, notifications).
 * `request` shows the system prompt on Android and resolves with the answer;
 * on desktop both methods resolve true. Declare them in `osPermissions` in
 * pulsar.json so they are included in the Android manifest.
 */
export const permissions = {
  request: (name: OSPermission): Promise<boolean> =>
    callCapability("permissions.request", { name }) as Promise<boolean>,
  check: (name: OSPermission): Promise<boolean> =>
    callCapability("permissions.check", { name }) as Promise<boolean>,
}
