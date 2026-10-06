import { readFileSync } from "fs"
import { join } from "path"
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
  /** Reserved for a future permission model; not enforced yet. */
  permissions?: string[]
  /** Custom URL schemes the app handles. */
  protocols?: { scheme: string }[]
  singleInstance?: boolean
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
    ui: overrides.ui ?? manifest?.windows?.[0]?.ui ?? "ui/main.qml",
    id: overrides.id ?? manifest?.id,
  }
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
    ui: win.ui ?? "ui/main.qml",
    id: manifest.id,
  }))
}

/** Read pulsar.json from the app directory. Returns null when absent/invalid. */
export function loadManifest(appDir = process.env.PULSAR_APP ?? process.cwd()): AppManifest | null {
  try {
    const raw = readFileSync(join(appDir, "pulsar.json"), "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as AppManifest
  } catch {}
  return null
}
