import { readFileSync } from "fs"
import { join } from "path"
import type { AppManifest } from "../sdk/manifest.ts"

/** Read pulsar.json from disk (Bun/Node only). */
export function loadManifestFromDisk(appDir: string): AppManifest | null {
  try {
    const raw = readFileSync(join(appDir, "pulsar.json"), "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as AppManifest
  } catch {}
  return null
}
