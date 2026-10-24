import type { Platform } from "../platform.ts"
import type { CapRegistry } from "./types.ts"

/** Filesystem capabilities backed by a Platform implementation. */
export const createFsCaps = (platform: Platform): CapRegistry => ({
  "fs.readFile": (p: { path: string; encoding?: "utf8" | "base64" }) => platform.readFile(p.path, p.encoding),

  "fs.writeFile": (p: { path: string; content: string; encoding?: "utf8" | "base64" }) =>
    platform.writeFile(p.path, p.content, p.encoding),

  "fs.appendFile": (p: { path: string; content: string; encoding?: "utf8" | "base64" }) =>
    platform.appendFile(p.path, p.content, p.encoding),

  "fs.listDir": (p: { path?: string }) => platform.listDir(p.path),

  "fs.exists": (p: { path: string }) => platform.exists(p.path),

  "fs.stat": (p: { path: string }) => platform.stat(p.path),

  "fs.mkdir": (p: { path: string; recursive?: boolean }) => platform.mkdir(p.path, p.recursive),

  "fs.remove": (p: { path: string; recursive?: boolean }) => platform.remove(p.path, p.recursive),

  "fs.rename": (p: { from: string; to: string }) => platform.rename(p.from, p.to),

  "fs.copy": (p: { from: string; to: string; recursive?: boolean }) => platform.copy(p.from, p.to, p.recursive),

  "fs.moveToTrash": (p: { path: string }) => platform.moveToTrash(p.path),
})
