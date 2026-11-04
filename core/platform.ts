export type FsEncoding = "utf8" | "base64"

export interface FileStat {
  size: number
  isFile: boolean
  isDirectory: boolean
  mtimeMs: number
  createdAtMs: number
}

export interface AppPaths {
  data: string
  config: string
  cache: string
  temp: string
  home: string
}

/**
 * Everything the runtime needs from the host platform. The Bun adapter
 * implements this with Node APIs; an embedded engine (QuickJS on Android)
 * implements it natively. Capabilities are thin wrappers over this contract.
 */
export interface Platform {
  readonly name: string
  readonly kind: "desktop" | "mobile"
  readonly os: string

  env(name: string): string | undefined
  cwd(): string
  appId(): string
  paths(): Promise<AppPaths>

  readFile(path: string, encoding?: FsEncoding): Promise<string>
  writeFile(path: string, content: string, encoding?: FsEncoding): Promise<boolean>
  writeFileAtomic(path: string, content: string, encoding?: FsEncoding): Promise<boolean>
  appendFile(path: string, content: string, encoding?: FsEncoding): Promise<boolean>
  listDir(path?: string): Promise<string[]>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<FileStat>
  mkdir(path: string, recursive?: boolean): Promise<boolean>
  remove(path: string, recursive?: boolean): Promise<boolean>
  rename(from: string, to: string): Promise<boolean>
  copy(from: string, to: string, recursive?: boolean): Promise<boolean>
  moveToTrash(path: string): Promise<boolean>

  openUrl(url: string): Promise<boolean>
}
