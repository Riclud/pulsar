import type { AppPaths, FileStat, Platform } from "../../core/platform.ts"

const dirs: AppPaths = {
  data: "/data",
  config: "/config",
  cache: "/cache",
  temp: "/tmp",
  home: "/home",
}

export const createMemoryPlatform = (): Platform => {
  const files = new Map<string, string>()
  const directories = new Set<string>([dirs.data, dirs.config, dirs.cache, dirs.temp, dirs.home])

  return {
    name: "memory",
    kind: "desktop",
    os: "linux",

    env: () => undefined,
    cwd: () => "/app",
    appId: () => "portable",
    paths: async () => dirs,

    readFile: async (path) => {
      const value = files.get(path)

      if (value === undefined) throw new Error(`ENOENT: ${path}`)

      return value
    },

    writeFile: async (path, content) => {
      files.set(path, content)

      return true
    },
    writeFileAtomic: async (path, content) => {
      files.set(path, content)

      return true
    },

    appendFile: async (path, content) => {
      files.set(path, (files.get(path) ?? "") + content)

      return true
    },

    listDir: async (path = "/") => {
      const prefix = path.endsWith("/") ? path : path + "/"

      return [...files.keys()]
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length))
        .filter((name) => name.length > 0 && !name.includes("/"))
    },

    exists: async (path) => files.has(path) || directories.has(path),

    stat: async (path): Promise<FileStat> => {
      const content = files.get(path)

      if (content !== undefined) {
        return { size: content.length, isFile: true, isDirectory: false, mtimeMs: 0, createdAtMs: 0 }
      }

      if (directories.has(path)) {
        return { size: 0, isFile: false, isDirectory: true, mtimeMs: 0, createdAtMs: 0 }
      }

      throw new Error(`ENOENT: ${path}`)
    },

    mkdir: async (path) => {
      directories.add(path)

      return true
    },

    remove: async (path) => {
      files.delete(path)
      directories.delete(path)

      return true
    },

    rename: async (from, to) => {
      const value = files.get(from)

      if (value === undefined) throw new Error(`ENOENT: ${from}`)

      files.delete(from)
      files.set(to, value)

      return true
    },

    copy: async (from, to) => {
      const value = files.get(from)

      if (value === undefined) throw new Error(`ENOENT: ${from}`)

      files.set(to, value)

      return true
    },

    moveToTrash: async (path) => {
      files.delete(path)

      return true
    },

    openUrl: async () => true,
  }
}
