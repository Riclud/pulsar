import type { AppPaths } from "../platform.ts"
import type { Platform } from "../platform.ts"
import type { CapRegistry } from "../sdk/index.ts"

/** Keep an app id safe for use as a directory name. */
export const sanitizeAppId = (raw: string): string => {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")

  if (cleaned === "" || cleaned === "." || cleaned === "..") return "pulsar-app"

  return cleaned
}

/** Paths capability backed by a Platform implementation. */
export const createPathsCaps = (platform: Platform): CapRegistry => ({
  "paths.get": () => platform.paths(),
})
