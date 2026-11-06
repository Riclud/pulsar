export interface PlatformInfo {
  /** `linux`, `darwin`, `win32`, `android` or `ios`. */
  os: string
  kind: "desktop" | "mobile"
  /** The JavaScript engine running the app: `bun` or `quickjs`. */
  engine: string
}

let current: PlatformInfo | null = null

/** Set by the runtime before the app's code runs. */
export const setPlatformInfo = (info: PlatformInfo): void => {
  current = info
}

/** Where the app runs: the OS, desktop or mobile, and the JavaScript engine. */
export const platform = (): PlatformInfo => {
  if (current) return current

  return { os: "unknown", kind: "desktop", engine: typeof Bun === "undefined" ? "quickjs" : "bun" }
}
