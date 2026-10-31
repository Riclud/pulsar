import { createHash } from "crypto"
import { existsSync, readFileSync, realpathSync } from "fs"
import { basename, join, resolve } from "path"

/** GitHub repository that hosts the releases. */
export const REPO = process.env.PULSAR_REPO ?? "riclud/pulsar"

/** Root of the installed pulsar distribution (cli/ + core/ + templates/). */
export const pulsarRoot = (): string => {
  return resolve(import.meta.dir, "..")
}

/** Version of the running CLI. */
export const cliVersion = (): string => {
  try {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "package.json"), "utf8")) as { version?: string }

    return pkg.version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

const defaultDataDir = () => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "."

  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "pulsar")
  }

  if (process.platform === "darwin") return join(home, "Library", "Application Support", "pulsar")

  return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "pulsar")
}

/** Directory holding downloaded toolchain versions (`current` points to one). */
export const pulsarHome = (): string => {
  return process.env.PULSAR_HOME ?? defaultDataDir()
}

export const toolchainDir = (version: string): string => {
  return join(pulsarHome(), "toolchain", version)
}

export const toolchainCurrent = (): string => {
  return join(pulsarHome(), "toolchain", "current")
}

/** Version of the active toolchain, or null when none is installed. */
export const toolchainVersion = (): string | null => {
  try {
    return basename(realpathSync(toolchainCurrent()))
  } catch {
    return null
  }
}

/** `linux-x64`, `macos-arm64`, `windows-x64`. */
export const platformId = (): string => {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux"
  const arch = process.arch === "arm64" ? "arm64" : "x64"

  return `${os}-${arch}`
}

const exe = (name: string) => {
  return process.platform === "win32" ? `${name}.exe` : name
}

export const findHost = (): string => {
  const fromEnv = process.env.PULSAR_HOST

  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates = [
    resolve(pulsarRoot(), "build", "bin", exe("qml-host")),
    resolve(process.cwd(), "build", "bin", exe("qml-host")),
    join(toolchainCurrent(), "bin", exe("qml-host")),
    join(pulsarRoot(), "bin", exe("qml-host")),
    resolve("/usr/local/bin", exe("pulsar-host")),
  ]

  for (const c of candidates) if (existsSync(c)) return c

  throw new Error("host binary not found; run `pulsar install`")
}

export const findBridge = (host: string): string => {
  const fromEnv = process.env.PULSAR_BRIDGE

  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates = [
    join(host, "..", exe("bridge")),
    join(toolchainCurrent(), "bin", exe("bridge")),
    resolve(pulsarRoot(), "build", "bin", exe("bridge")),
  ]

  for (const c of candidates) if (existsSync(c)) return c

  throw new Error("bridge binary not found; run `pulsar install`")
}

export const flag = (args: string[], name: string): string | undefined => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === name) return args[i + 1]
    if (arg?.startsWith(name + "=")) return arg.slice(name.length + 1)
  }

  return undefined
}

export const findLauncher = (): string => {
  const fromEnv = process.env.PULSAR_LAUNCHER

  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates = [
    resolve(pulsarRoot(), "build", "bin", exe("launcher")),
    join(toolchainCurrent(), "bin", exe("launcher")),
    join(pulsarRoot(), "bin", exe("launcher")),
  ]

  for (const c of candidates) if (existsSync(c)) return c

  throw new Error("launcher binary not found; run `pulsar install`")
}

export const fileSha256 = (path: string): string => {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

/** GitHub API/release URL for an asset of a given tag ("latest" or "v0.1.0"). */
export const releaseUrl = (tag: string, asset: string): string => {
  const mirror = process.env.PULSAR_RELEASE_BASE

  if (mirror) return `${mirror.replace(/\/+$/, "")}/${asset}`

  const base =
    tag === "latest"
      ? `https://github.com/${REPO}/releases/latest/download`
      : `https://github.com/${REPO}/releases/download/${tag}`

  return `${base}/${asset}`
}
