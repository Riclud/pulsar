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

export type Target = "desktop" | "android"
export type RuntimeKind = "bun" | "quickjs"
export type Compat = "portable" | "desktop"

export interface RuntimeConfig {
  default?: RuntimeKind
  desktop?: RuntimeKind
  android?: RuntimeKind
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
  /** Custom URL schemes the app handles. */
  protocols?: { scheme: string }[]
  /** File types the app registers as a handler for. */
  fileAssociations?: FileAssociation[]
  singleInstance?: boolean
  /** Build targets; desktop only unless android is added explicitly. */
  targets?: Target[]
  /** Runtime per target. Desktop defaults to bun, android to quickjs. */
  runtime?: RuntimeConfig
  /** Portable code is required when android is a target. */
  compat?: Compat
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
  "icon",
] as const

/** Turn a manifest window into the overlapping AppConfig fields. */
function windowToConfig(win: ManifestWindow | undefined): Partial<AppConfig> {
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
export function resolveAppConfig(manifest: AppManifest | null, overrides: Partial<AppConfig> = {}): AppConfig {
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

/** Runtime for a target, defaulting to bun on desktop and quickjs on android. */
export const manifestRuntime = (manifest: AppManifest | null, target: Target): RuntimeKind => {
  return manifest?.runtime?.[target] ?? manifest?.runtime?.default ?? (target === "android" ? "quickjs" : "bun")
}

/** Portability mode, defaulting to portable when android is a target. */
export const manifestCompat = (manifest: AppManifest | null): Compat => {
  return manifest?.compat ?? (manifestTargets(manifest).includes("android") ? "portable" : "desktop")
}

/** Default label for the window at `index`. */
function defaultLabel(index: number): string {
  return index === 0 ? "main" : `window-${index + 1}`
}

/**
 * Resolve the windows to open. Manifest windows are used unless explicit
 * options are given, which collapse to a single window (overrides win).
 */
export function resolveWindows(manifest: AppManifest | null, overrides: Partial<AppConfig> = {}): AppConfig[] {
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
export function setManifest(manifest: AppManifest | null | undefined): void {
  manifestOverride = manifest
}

/** The manifest injected by the runtime (embedded engines have no filesystem). */
export function loadManifest(): AppManifest | null {
  return manifestOverride ?? null
}
