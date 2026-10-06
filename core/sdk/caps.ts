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

/** Invoke a capability by name. Rejects if it is not registered. */
export function callCapability(name: string, params?: unknown): Promise<unknown> {
  const handler = capabilities[name]
  if (!handler) return Promise.reject(new Error(`unknown capability: ${name}`))
  return handler(params ?? {})
}

/** Built-in filesystem capabilities. */
export const fs = {
  readFile: (path: string): Promise<string> => callCapability("fs.readFile", { path }) as Promise<string>,
  writeFile: (path: string, content: string): Promise<boolean> =>
    callCapability("fs.writeFile", { path, content }) as Promise<boolean>,
  listDir: (path?: string): Promise<string[]> => callCapability("fs.listDir", { path }) as Promise<string[]>,
  exists: (path: string): Promise<boolean> => callCapability("fs.exists", { path }) as Promise<boolean>,
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
  saveFile: (options: FileDialogOptions = {}): Promise<string | null> =>
    callCapability("dialog.saveFile", options) as Promise<string | null>,
  message: (options: MessageDialogOptions = {}): Promise<boolean> =>
    callCapability("dialog.message", options) as Promise<boolean>,
}

/** Open URLs and show desktop notifications via the OS shell. */
export const shell = {
  open: (url: string): Promise<boolean> => callCapability("shell.open", { url }) as Promise<boolean>,
  notify: (title: string, body?: string): Promise<boolean> =>
    callCapability("shell.notify", { title, body }) as Promise<boolean>,
}

/** Persist JSON-safe values to the app data directory (storage.json). */
export const storage = {
  get: (key: string): Promise<unknown> => callCapability("storage.get", { key }),
  has: (key: string): Promise<boolean> => callCapability("storage.has", { key }) as Promise<boolean>,
  set: (key: string, value: unknown): Promise<boolean> =>
    callCapability("storage.set", { key, value }) as Promise<boolean>,
  remove: (key: string): Promise<boolean> => callCapability("storage.remove", { key }) as Promise<boolean>,
}
