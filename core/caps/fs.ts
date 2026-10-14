import { spawn } from "child_process"
import { promises as fs } from "fs"
import { dirname } from "path"
import type { CapRegistry } from "./types.ts"

type Encoding = "utf8" | "base64"

const readEncoding = (encoding?: string): BufferEncoding => {
  return encoding === "base64" ? "base64" : "utf8"
}

const run = (cmd: string, args: string[]): Promise<boolean> => {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "ignore" })
    child.on("error", () => resolve(false))
    child.on("exit", (code) => resolve(code === 0))
  })
}

/** Best-effort move to the OS trash/recycle bin. */
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

export const fsCaps: CapRegistry = {
  "fs.readFile": async (p: { path: string; encoding?: Encoding }) => fs.readFile(p.path, readEncoding(p.encoding)),

  "fs.writeFile": async (p: { path: string; content: string; encoding?: Encoding }) => {
    await fs.mkdir(dirname(p.path), { recursive: true })
    await fs.writeFile(p.path, p.content, readEncoding(p.encoding))
    return true
  },

  "fs.appendFile": async (p: { path: string; content: string; encoding?: Encoding }) => {
    await fs.appendFile(p.path, p.content, readEncoding(p.encoding))
    return true
  },

  "fs.listDir": async (p: { path?: string }) => {
    const entries = await fs.readdir(p.path ?? ".", { withFileTypes: true })
    return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name))
  },

  "fs.exists": async (p: { path: string }) => {
    try {
      await fs.access(p.path)
      return true
    } catch {
      return false
    }
  },

  "fs.stat": async (p: { path: string }) => {
    const s = await fs.stat(p.path)
    return {
      size: s.size,
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      mtimeMs: s.mtimeMs,
      createdAtMs: s.birthtimeMs,
    }
  },

  "fs.mkdir": async (p: { path: string; recursive?: boolean }) => {
    await fs.mkdir(p.path, { recursive: p.recursive ?? true })
    return true
  },

  "fs.remove": async (p: { path: string; recursive?: boolean }) => {
    await fs.rm(p.path, { recursive: p.recursive ?? false, force: true })
    return true
  },

  "fs.rename": async (p: { from: string; to: string }) => {
    await fs.mkdir(dirname(p.to), { recursive: true })
    await fs.rename(p.from, p.to)
    return true
  },

  "fs.copy": async (p: { from: string; to: string; recursive?: boolean }) => {
    await fs.cp(p.from, p.to, { recursive: p.recursive ?? true })
    return true
  },

  "fs.moveToTrash": async (p: { path: string }) => moveToTrash(p.path),
}
