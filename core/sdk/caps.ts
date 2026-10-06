export type CapHandler = (params: any) => Promise<unknown>
export type CapRegistry = Record<string, CapHandler>

export interface FetchResult {
  status: number
  url: string
  text: string
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
