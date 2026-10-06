import { homedir } from "os"
import { basename, join } from "path"
import { mkdir } from "fs/promises"
import { App } from "../sdk/index.ts"
import type { AppPaths } from "../sdk/index.ts"
import type { CapRegistry } from "../sdk/index.ts"

/** Keep an app id safe for use as a directory name. */
export function sanitizeAppId(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
  if (cleaned === "" || cleaned === "." || cleaned === "..") return "pulsar-app"
  return cleaned
}

/** The name under which this app stores its data (config id > app dir > cwd). */
export function currentAppId(): string {
  const appId = App.current?.config.id
  if (appId) return sanitizeAppId(appId)
  const appDir = process.env.PULSAR_APP
  if (appDir) return sanitizeAppId(basename(appDir))
  return sanitizeAppId(basename(process.cwd()))
}

/**
 * Pure path resolution per platform, easy to unit test. `env` is the
 * environment variables map (process.env in production).
 */
export function computePaths(
  appId: string,
  platform: string,
  home: string,
  env: Record<string, string | undefined>,
): AppPaths {
  const id = sanitizeAppId(appId)
  const temp = env.TMPDIR ?? env.TEMP ?? (platform === "win32" ? join(home, "AppData", "Local", "Temp") : "/tmp")

  if (platform === "darwin") {
    return {
      data: join(home, "Library", "Application Support", id),
      config: join(home, "Library", "Application Support", id),
      cache: join(home, "Library", "Caches", id),
      temp,
      home,
    }
  }

  if (platform === "win32") {
    const roaming = env.APPDATA ?? join(home, "AppData", "Roaming")
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local")
    return {
      data: join(roaming, id),
      config: join(roaming, id),
      cache: join(local, id, "cache"),
      temp,
      home,
    }
  }

  // Linux and the rest: XDG, falling back to ~/.local/share, ~/.config, ~/.cache.
  return {
    data: join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), id),
    config: join(env.XDG_CONFIG_HOME ?? join(home, ".config"), id),
    cache: join(env.XDG_CACHE_HOME ?? join(home, ".cache"), id),
    temp,
    home,
  }
}

/** Resolved paths with data/config/cache ensured to exist. */
export async function appPaths(): Promise<AppPaths> {
  const paths = computePaths(currentAppId(), process.platform, homedir(), process.env)
  await Promise.all([
    mkdir(paths.data, { recursive: true }),
    mkdir(paths.config, { recursive: true }),
    mkdir(paths.cache, { recursive: true }),
  ])
  return paths
}

export const pathsCaps: CapRegistry = {
  "paths.get": async () => appPaths(),
}
