import { mkdir } from "fs/promises"
import { homedir } from "os"
import { basename, join } from "path"
import { sanitizeAppId } from "../caps/paths.ts"
import type { AppPaths } from "../platform.ts"
import { App } from "../sdk/index.ts"

/** Pure path resolution per platform, easy to unit test. */
export const computePaths = (
  appId: string,
  platform: string,
  home: string,
  env: Record<string, string | undefined>,
): AppPaths => {
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

  return {
    data: join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), id),
    config: join(env.XDG_CONFIG_HOME ?? join(home, ".config"), id),
    cache: join(env.XDG_CACHE_HOME ?? join(home, ".cache"), id),
    temp,
    home,
  }
}

/** The name under which this app stores its data (config id > app dir > cwd). */
export const currentAppId = (): string => {
  const appId = App.current?.config.id

  if (appId) return sanitizeAppId(appId)

  const appDir = process.env.PULSAR_APP

  if (appDir) return sanitizeAppId(basename(appDir))

  return sanitizeAppId(basename(process.cwd()))
}

const ensured = new Map<string, Promise<AppPaths>>()

const ensurePaths = async (id: string) => {
  const paths = computePaths(id, process.platform, homedir(), process.env)

  await Promise.all([
    mkdir(paths.data, { recursive: true }),
    mkdir(paths.config, { recursive: true }),
    mkdir(paths.cache, { recursive: true }),
  ])

  return paths
}

/** Drop the memoized paths, so tests can isolate their environment. */
export const resetAppPaths = (): void => {
  ensured.clear()
}

/** Resolved paths with data/config/cache ensured to exist. */
export const appPaths = async (): Promise<AppPaths> => {
  const id = currentAppId()
  const cached = ensured.get(id)

  if (cached) return cached

  const pending = ensurePaths(id).catch((e) => {
    ensured.delete(id)

    throw e
  })

  ensured.set(id, pending)

  return pending
}
