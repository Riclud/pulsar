import { existsSync, readFileSync } from "fs"
import { basename, dirname, join } from "path"
import type { AppManifest, RuntimeKind, Target } from "../core/sdk/manifest.ts"

export type BuildTarget = Target | "portable"

export const readManifest = (appDir: string): AppManifest | null => {
  try {
    const parsed = JSON.parse(readFileSync(join(appDir, "pulsar.json"), "utf8")) as unknown

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as AppManifest
  } catch {}

  return null
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
  const suffixes = [platform, engine === "bun" ? ".bun" : ".quickjs"]

  const candidates = [
    ...suffixes.map((suffix) => join(appDir, dir, `${stem}${suffix}${ext || ".ts"}`)),
    join(appDir, base),
  ]

  for (const candidate of candidates) if (existsSync(candidate)) return candidate

  console.error(`pulsar: no entry point for ${target} (looked for ${candidates.join(", ")})`)
  process.exit(1)
}

export const launcherName = (dir: string): string => {
  for (const file of ["pulsar.json", "package.json"]) {
    try {
      const name = JSON.parse(readFileSync(join(dir, file), "utf8")).name

      if (typeof name === "string" && name.length > 0)
        return name.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
    } catch {}
  }

  return "app"
}
