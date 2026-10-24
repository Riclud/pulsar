import type { AppPaths, FsEncoding, FileStat, Platform } from "../platform.ts"

declare const __pulsarPlatformInfo: () => string
declare const __pulsarPaths: () => string
declare const __pulsarEnv: (name: string) => string | undefined
declare const __pulsarReadFile: (path: string, encoding: string) => string
declare const __pulsarWriteFile: (path: string, content: string, encoding: string) => boolean
declare const __pulsarAppendFile: (path: string, content: string, encoding: string) => boolean
declare const __pulsarListDir: (path: string) => string[]
declare const __pulsarExists: (path: string) => boolean
declare const __pulsarStat: (path: string) => string
declare const __pulsarMkdir: (path: string, recursive: boolean) => boolean
declare const __pulsarRemove: (path: string, recursive: boolean) => boolean
declare const __pulsarRename: (from: string, to: string) => boolean
declare const __pulsarCopy: (from: string, to: string, recursive: boolean) => boolean
declare const __pulsarMoveToTrash: (path: string) => boolean
declare const __pulsarOpenUrl: (url: string) => boolean

interface PlatformInfo {
  name: string
  kind: "desktop" | "mobile"
  os: string
  appId: string
  cwd: string
}

/** Platform backed by native globals installed by the embedded host. */
export const createQuickJsPlatform = (): Platform => {
  const info = JSON.parse(__pulsarPlatformInfo()) as PlatformInfo

  return {
    name: info.name,
    kind: info.kind,
    os: info.os,

    env: (name) => __pulsarEnv(name),
    cwd: () => info.cwd,
    appId: () => info.appId,
    paths: async () => JSON.parse(__pulsarPaths()) as AppPaths,

    readFile: async (path, encoding: FsEncoding = "utf8") => __pulsarReadFile(path, encoding),
    writeFile: async (path, content, encoding: FsEncoding = "utf8") => __pulsarWriteFile(path, content, encoding),
    appendFile: async (path, content, encoding: FsEncoding = "utf8") => __pulsarAppendFile(path, content, encoding),
    listDir: async (path = ".") => __pulsarListDir(path),
    exists: async (path) => __pulsarExists(path),
    stat: async (path) => JSON.parse(__pulsarStat(path)) as FileStat,
    mkdir: async (path, recursive = true) => __pulsarMkdir(path, recursive),
    remove: async (path, recursive = false) => __pulsarRemove(path, recursive),
    rename: async (from, to) => __pulsarRename(from, to),
    copy: async (from, to, recursive = true) => __pulsarCopy(from, to, recursive),
    moveToTrash: async (path) => __pulsarMoveToTrash(path),

    openUrl: async (url) => __pulsarOpenUrl(url),
  }
}
