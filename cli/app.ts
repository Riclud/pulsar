import { existsSync, readdirSync, readFileSync } from "fs"
import { basename, dirname, join } from "path"
import { validateManifest, type AppManifest, type RuntimeKind, type Target } from "../core/sdk/manifest.ts"
import { ui } from "./ui.ts"

export type BuildTarget = Target | "portable"

export const readManifest = (appDir: string): AppManifest | null => {
  let parsed: unknown

  try {
    parsed = JSON.parse(readFileSync(join(appDir, "pulsar.json"), "utf8"))
  } catch {
    // A missing or broken pulsar.json means no manifest.
    return null
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  const problems = validateManifest(parsed)

  for (const problem of problems) ui.error(`pulsar.json: ${problem}`)

  if (problems.length > 0) process.exit(1)

  return parsed as AppManifest
}

const MEDIA_USE = /\bmedia\s*\.\s*(load|play|toggle)\s*\(|\b(MediaPlayer|VideoOutput)\s*\{|<Video\b|\bVideo\s*\(\s*\{/
const SOURCE_FILE = /\.(m?[jt]sx?|qml)$/
const NOT_SOURCES = new Set(["node_modules", "dist", "build", ".git", ".pulsar"])

/** Whether the app plays audio or video itself, so it needs FFmpeg. */
export const usesMedia = (appDir: string): boolean => {
  const walk = (dir: string): boolean => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (NOT_SOURCES.has(entry.name)) continue

      const path = join(dir, entry.name)

      if (entry.isDirectory() && walk(path)) return true
      if (entry.isFile() && SOURCE_FILE.test(entry.name) && MEDIA_USE.test(readFileSync(path, "utf8"))) return true
    }

    return false
  }

  return walk(appDir)
}

/** Whether the build bundles the video backend: the manifest decides, else the app's use of media. */
export const wantsVideo = (appDir: string, manifest: AppManifest | null): boolean => {
  return manifest?.video ?? usesMedia(appDir)
}

export const resolveEntry = (
  appDir: string,
  manifest: AppManifest | null,
  target: BuildTarget,
  engine: RuntimeKind = target === "desktop" ? "bun" : "quickjs",
): string => {
  const base = manifest?.main ?? (existsSync(join(appDir, "main.tsx")) ? "main.tsx" : "main.ts")
  const dir = dirname(base)
  const file = basename(base)
  const ext = [".tsx", ".ts", ".js"].find((value) => file.endsWith(value)) ?? ""
  const stem = ext ? file.slice(0, -ext.length) : file
  const platform = target === "desktop" ? ".desktop" : target === "android" ? ".android" : ".portable"
  const suffixes = [platform, `.${engine}`]

  const candidates = [
    ...suffixes.map((suffix) => join(appDir, dir, `${stem}${suffix}${ext || ".ts"}`)),
    join(appDir, base),
  ]

  for (const candidate of candidates) if (existsSync(candidate)) return candidate

  ui.error(`no entry point for ${target} (looked for ${candidates.join(", ")})`)
  process.exit(1)
}

const readName = (path: string): string | null => {
  try {
    const name: unknown = JSON.parse(readFileSync(path, "utf8")).name

    return typeof name === "string" && name.length > 0 ? name : null
  } catch {
    // An unreadable file just means the next name source is tried.
    return null
  }
}

export const launcherName = (dir: string): string => {
  for (const file of ["pulsar.json", "package.json"]) {
    const name = readName(join(dir, file))

    if (name) return name.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
  }

  return "app"
}
