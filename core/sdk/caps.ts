export type CapHandler = (params: any) => Promise<unknown>
export type CapRegistry = Record<string, CapHandler>

export interface FetchResult {
  status: number
  url: string
  text: string
}

export interface AppPaths {
  data: string
  config: string
  cache: string
  temp: string
  home: string
}

// Handlers are installed by the runtime so that calls made from the app and
// from QML go through the same registry.
const capabilities: CapRegistry = {}

/** Register a single capability handler. */
export function registerCapability(name: string, handler: CapHandler): void {
  capabilities[name] = handler
}

/** Register a batch of capability handlers. */
export function registerCapabilities(caps: CapRegistry): void {
  Object.assign(capabilities, caps)
}

/** Whether a capability with this name is registered. */
export function hasCapability(name: string): boolean {
  return name in capabilities
}

/** Names of all registered capabilities. */
export const listCapabilities = (): string[] => {
  return Object.keys(capabilities)
}

/** Invoke a capability by name. Rejects if it is not registered. */
export function callCapability(name: string, params?: unknown): Promise<unknown> {
  const handler = capabilities[name]
  if (!handler) return Promise.reject(new Error(`unknown capability: ${name}`))
  return handler(params ?? {})
}

/** File/binary content encoding passed over the control channel. */
export type FsEncoding = "utf8" | "base64"

export interface FileStat {
  size: number
  isFile: boolean
  isDirectory: boolean
  mtimeMs: number
  createdAtMs: number
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
}

/** Built-in network capabilities. */
export const net = {
  fetch: (url: string): Promise<FetchResult> => callCapability("nw.fetch", { url }) as Promise<FetchResult>,
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

export interface NotifyOptions {
  title: string
  body?: string
}

/**
 * Native desktop notifications. Returns a token; when the user clicks the
 * notification the app gets a `notification-click` event carrying that token.
 */
export const notify = {
  show: (options: NotifyOptions): Promise<string> => callCapability("shell.notify", options) as Promise<string>,
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

/** System appearance; the app also gets a `theme-changed` event on switches. */
export const theme = {
  current: (): Promise<{ scheme: ColorScheme }> => callCapability("theme.get") as Promise<{ scheme: ColorScheme }>,
}

export interface SystemLocale {
  locale: string
  language: string
  timezone: string
}

export const system = {
  locale: (): Promise<SystemLocale> => callCapability("system.locale") as Promise<SystemLocale>,
}
