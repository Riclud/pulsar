import type { AppConfig } from "./app.ts"

/** One initial window declared in pulsar.json. */
export interface ManifestWindow {
  label?: string
  ui?: string
  width?: number
  height?: number
  title?: string
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  resizable?: boolean
  frameless?: boolean
  /** Transparent window background for compositor blur/rounding. */
  transparent?: boolean
  icon?: string
}

/** One file type the app can open. */
export interface FileAssociation {
  /** Extension without the dot, e.g. "md". */
  ext: string
  /** MIME type used by Linux desktop entries, e.g. "text/markdown". */
  mime?: string
  /** Human-readable type name shown by the OS. */
  name?: string
}

export type Target = "desktop" | "android" | "ios"
export type RuntimeKind = "bun" | "quickjs" | "node"
export type Compat = "portable" | "desktop"

export interface RuntimeConfig {
  default?: RuntimeKind
  desktop?: RuntimeKind
  android?: RuntimeKind
  ios?: RuntimeKind
}

/** The application manifest. One pulsar.json drives config and packaging. */
export interface AppManifest {
  /** Reverse-DNS id, used for data directories and packaging. */
  id?: string
  name?: string
  version?: string
  /** Entry point relative to the manifest. */
  main?: string
  /** Platform icon paths, keyed by linux/macos/windows. */
  icons?: Record<string, string>
  /** Initial windows. */
  windows?: ManifestWindow[]
  /** Capabilities the app may use; absent means all are allowed. */
  permissions?: string[]
  /**
   * Runtime OS permissions to declare (and request at runtime) on Android:
   * camera, microphone, location, notifications, storage.
   */
  osPermissions?: string[]
  /** Custom URL schemes the app handles. */
  protocols?: { scheme: string }[]
  /** File types the app registers as a handler for. */
  fileAssociations?: FileAssociation[]
  singleInstance?: boolean
  /** Build targets; desktop only unless android is added explicitly. */
  targets?: Target[]
  /** Runtime per target. Desktop builds pick quickjs unless the code needs bun; mobile uses quickjs. */
  runtime?: RuntimeConfig
  /** Portable code is required when android is a target. */
  compat?: Compat
  /** Extra paths kept out of builds, using .gitignore syntax. */
  ignore?: string[]
  /**
   * Bundle the in-app video player (FFmpeg, about 20 MB) in desktop builds.
   * Defaults to true when the app uses `media`. Without it videos open in the
   * system player.
   */
  video?: boolean
}

const WINDOW_KEYS = [
  "label",
  "ui",
  "width",
  "height",
  "title",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "resizable",
  "frameless",
  "transparent",
  "icon",
] as const

/** Turn a manifest window into the overlapping AppConfig fields. */
const windowToConfig = (win: ManifestWindow | undefined): Partial<AppConfig> => {
  const out: Partial<AppConfig> = {}

  if (!win) return out

  for (const key of WINDOW_KEYS) {
    const value = win[key]

    if (value !== undefined) (out as Record<string, unknown>)[key] = value
  }

  return out
}

/**
 * Merge explicit AppConfig over manifest defaults. Explicit values always win;
 * a missing UI falls back to the bundled convention.
 */
export const resolveAppConfig = (manifest: AppManifest | null, overrides: Partial<AppConfig> = {}): AppConfig => {
  return {
    ...windowToConfig(manifest?.windows?.[0]),
    ...overrides,
    id: overrides.id ?? manifest?.id,
  }
}

/** Build targets, defaulting to desktop only. */
export const manifestTargets = (manifest: AppManifest | null): Target[] => {
  return manifest?.targets?.length ? manifest.targets : ["desktop"]
}

/** Runtime the manifest asks for on a target, if it asks at all. */
export const explicitRuntime = (manifest: AppManifest | null, target: Target): RuntimeKind | undefined => {
  return manifest?.runtime?.[target] ?? manifest?.runtime?.default
}

/** Runtime for a target, defaulting to bun on desktop and quickjs on mobile. */
export const manifestRuntime = (manifest: AppManifest | null, target: Target): RuntimeKind => {
  return manifest?.runtime?.[target] ?? manifest?.runtime?.default ?? (target === "desktop" ? "bun" : "quickjs")
}

/** Portability mode, defaulting to portable when a mobile target is listed. */
export const manifestCompat = (manifest: AppManifest | null): Compat => {
  const mobile = manifestTargets(manifest).some((target) => target !== "desktop")

  return manifest?.compat ?? (mobile ? "portable" : "desktop")
}

/** Default label for the window at `index`. */
const defaultLabel = (index: number): string => {
  return index === 0 ? "main" : `window-${index + 1}`
}

/**
 * Resolve the windows to open. Manifest windows are used unless explicit
 * options are given, which collapse to a single window (overrides win).
 */
export const resolveWindows = (manifest: AppManifest | null, overrides: Partial<AppConfig> = {}): AppConfig[] => {
  const hasOverrides = Object.keys(overrides).length > 0

  if (hasOverrides || !manifest?.windows?.length) return [resolveAppConfig(manifest, overrides)]

  return manifest.windows.map((win, i) => ({
    ...windowToConfig(win),
    label: win.label ?? defaultLabel(i),
    id: manifest.id,
  }))
}

let manifestOverride: AppManifest | null | undefined

/** Inject the manifest (embedded engines have no filesystem to read it from). */
export const setManifest = (manifest: AppManifest | null | undefined): void => {
  manifestOverride = manifest
}

/** The manifest injected by the runtime (embedded engines have no filesystem). */
export const loadManifest = (): AppManifest | null => {
  return manifestOverride ?? null
}
