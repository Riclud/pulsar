import { createHash } from "crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "fs"
import { spawnSync } from "child_process"
import { basename, dirname, join, relative, resolve, sep } from "path"

/** GitHub repository that hosts the releases. */
export const REPO = process.env.PULSAR_REPO ?? "riclud/pulsar"

/** Root of the pulsar distribution (cli/ + core/ + templates/). */
export const pulsarRoot = (): string => {
  const source = process.env.PULSAR_SOURCE

  if (source) return resolve(source)
  // Package managers start the CLI through a symlink or shim; the files sit beside the real binary.
  if (isCompiled()) return resolve(dirname(realpathSync(process.execPath)), "..")

  return resolve(import.meta.dir, "..")
}

/** True when this is the single-file `pulsar` binary, which carries Bun inside. */
export const isCompiled = (): boolean => /\$bunfs|~BUN/.test(import.meta.dir)

/**
 * How to run Bun: the binary that runs this CLI. The single-file `pulsar`
 * acts as Bun when `BUN_BE_BUN` is set, so no separate Bun is needed.
 */
export const bunCommand = (): { path: string; env: NodeJS.ProcessEnv } => {
  return { path: process.execPath, env: isCompiled() ? { ...process.env, BUN_BE_BUN: "1" } : process.env }
}

const LOCK_FILES: Array<[string, string]> = [
  ["package-lock.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
]

/**
 * Installs the app's packages when `node_modules` is missing, with the package
 * manager its lock file belongs to, or with the built-in Bun otherwise.
 */
export const installDependencies = (appDir: string, force = false): void => {
  if (!force && existsSync(join(appDir, "node_modules"))) return
  if (!existsSync(join(appDir, "package.json"))) return

  const manager = LOCK_FILES.find(([file]) => existsSync(join(appDir, file)))?.[1]

  if (
    manager &&
    spawnSync(manager, ["install"], { cwd: appDir, stdio: "inherit", shell: process.platform === "win32" }).status === 0
  ) {
    return
  }

  const bun = bunCommand()

  spawnSync(bun.path, ["install"], { cwd: appDir, stdio: "inherit", env: bun.env })
}

/** Directory of the SDK shipped with the active distribution. */
export const sdkDir = (): string => {
  if (process.env.PULSAR_SOURCE) return join(pulsarRoot(), "core", "sdk")

  const current = join(pulsarHome(), "current", "core", "sdk")
  const home = resolve(pulsarHome())
  const root = resolve(pulsarRoot())

  if (existsSync(current) && (root === home || root.startsWith(home + sep))) return current

  return join(pulsarRoot(), "core", "sdk")
}

/** Link (or copy) the SDK into an app's node_modules as `pulsar`. */
export const linkSdk = (target: string, sdk = sdkDir()): void => {
  const nodeModules = join(target, "node_modules")
  const link = join(nodeModules, "pulsar")

  mkdirSync(nodeModules, { recursive: true })
  rmSync(link, { recursive: true, force: true })

  try {
    symlinkSync(relative(nodeModules, sdk) || sdk, link, "dir")
  } catch {
    cpSync(sdk, link, { recursive: true })
  }
}

/** Version of the running CLI. */
export const cliVersion = (): string => {
  try {
    const pkg = JSON.parse(readFileSync(join(pulsarRoot(), "cli", "package.json"), "utf8")) as { version?: string }

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
/**
 * Whether the toolchain ships beside the CLI, as in system packages (AUR,
 * Homebrew, Scoop, winget), instead of being installed with `pulsar install`.
 */
export const bundledToolchain = (): boolean => existsSync(join(pulsarRoot(), "bin", exe("qml-host")))

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
    join(pulsarRoot(), "bin", exe("qml-host")),
    join(toolchainCurrent(), "bin", exe("qml-host")),
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
    join(pulsarRoot(), "bin", exe("launcher")),
    join(toolchainCurrent(), "bin", exe("launcher")),
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
