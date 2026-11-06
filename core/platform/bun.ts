import { spawn } from "child_process"
import { promises as fs } from "fs"
import { dirname } from "path"
import { appPaths, currentAppId } from "./bun-paths.ts"
import type { AppPaths, FsEncoding, FileStat, Platform } from "../platform.ts"

const readEncoding = (encoding?: FsEncoding): BufferEncoding => {
  return encoding === "base64" ? "base64" : "utf8"
}

const run = (cmd: string, args: string[]): Promise<boolean> => {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "ignore" })
    child.on("error", () => resolve(false))
    child.on("exit", (code) => resolve(code === 0))
  })
}

const moveToTrash = async (path: string): Promise<boolean> => {
  if (process.platform === "darwin")
    return run("osascript", ["-e", `tell application "Finder" to delete POSIX file ${JSON.stringify(path)}`])

  if (process.platform === "win32") {
    const escaped = path.replace(/'/g, "''")

    return run("powershell", [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escaped}','OnlyErrorDialogs','SendToRecycleBin')`,
    ])
  }

  if (await run("gio", ["trash", path])) return true

  return run("trash-put", [path])
}

const opener = (url: string): { cmd: string; args: string[] } => {
  if (process.platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", url] }
  if (process.platform === "darwin") return { cmd: "open", args: [url] }

  return { cmd: "xdg-open", args: [url] }
}

let atomicWrites = 0

/** Platform backed by Bun/Node: filesystem, paths and shell integration. */
export const createBunPlatform = (): Platform => {
  return {
    name: typeof Bun === "undefined" ? "node" : "bun",
    kind: "desktop",
    os: process.platform,

    env: (name) => process.env[name],
    cwd: () => process.cwd(),
    appId: () => currentAppId(),
    paths: (): Promise<AppPaths> => appPaths(),

    readFile: (path, encoding) => fs.readFile(path, readEncoding(encoding)),

    writeFile: async (path, content, encoding) => {
      await fs.mkdir(dirname(path), { recursive: true })
      await fs.writeFile(path, content, readEncoding(encoding))

      return true
    },

    writeFileAtomic: async (path, content, encoding) => {
      await fs.mkdir(dirname(path), { recursive: true })

      const temporary = `${path}.${process.pid}.${++atomicWrites}.tmp`

      try {
        const file = await fs.open(temporary, "w")

        try {
          await file.writeFile(content, readEncoding(encoding))
          await file.sync()
        } finally {
          await file.close()
        }

        await fs.rename(temporary, path)
      } catch (error) {
        await fs.rm(temporary, { force: true })

        throw error
      }

      return true
    },

    appendFile: async (path, content, encoding) => {
      await fs.appendFile(path, content, readEncoding(encoding))

      return true
    },

    appendBytes: async (path, bytes) => {
      await fs.appendFile(path, bytes)

      return true
    },

    listDir: async (path) => {
      const entries = await fs.readdir(path ?? ".", { withFileTypes: true })

      return entries.map((entry) => (entry.isDirectory() ? entry.name + "/" : entry.name))
    },

    exists: async (path) => {
      try {
        await fs.access(path)

        return true
      } catch {
        return false
      }
    },

    stat: async (path): Promise<FileStat> => {
      const value = await fs.stat(path)

      return {
        size: value.size,
        isFile: value.isFile(),
        isDirectory: value.isDirectory(),
        mtimeMs: value.mtimeMs,
        createdAtMs: value.birthtimeMs,
      }
    },

    mkdir: async (path, recursive = true) => {
      await fs.mkdir(path, { recursive })

      return true
    },

    remove: async (path, recursive = false) => {
      await fs.rm(path, { recursive, force: true })

      return true
    },

    rename: async (from, to) => {
      await fs.mkdir(dirname(to), { recursive: true })
      await fs.rename(from, to)

      return true
    },

    copy: async (from, to, recursive = true) => {
      await fs.cp(from, to, { recursive, preserveTimestamps: true })

      return true
    },

    moveToTrash,

    openUrl: (url) => {
      const { cmd, args } = opener(url)

      return new Promise((resolve) => {
        const child = spawn(cmd, args, { stdio: "ignore", detached: true })
        child.on("error", () => resolve(false))
        child.on("exit", (code) => resolve(code === 0))
      })
    },
  }
}
