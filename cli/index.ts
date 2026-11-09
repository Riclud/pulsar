#!/usr/bin/env bun
import type { BunPlugin } from "bun"
import { spawnSync } from "child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from "fs"
import { tmpdir } from "os"
import { basename, dirname, join, relative, resolve } from "path"
import {
  manifestCompat,
  explicitRuntime,
  manifestRuntime,
  manifestTargets,
  type AppManifest,
  type Compat,
  type RuntimeKind,
} from "../core/sdk/manifest.ts"
import { compileAppShaders, watchAppShaders } from "./shaders.ts"
import {
  bunCommand,
  bundledToolchain,
  cliVersion,
  findBridge,
  findHost,
  findLauncher,
  installDependencies,
  linkSdk,
  platformId,
  pulsarRoot,
  toolchainVersion,
} from "./core.ts"
import { ANDROID_QT_VERSION, buildAndroid, bundleRuntime, installAndroid } from "./android.ts"
import { buildIos } from "./ios.ts"
import { launcherName, readManifest, resolveEntry, wantsVideo, type BuildTarget } from "./app.ts"
import { create } from "./create.ts"
import {
  deviceBack,
  deviceEval,
  deviceExpect,
  deviceHover,
  deviceKey,
  deviceKeys,
  deviceReload,
  devicePerf,
  deviceScroll,
  deviceSelect,
  deviceShot,
  deviceState,
  deviceSwipe,
  deviceTap,
  deviceTapAt,
  deviceToggle,
  deviceType,
  deviceUI,
  type TapQuery,
} from "./device.ts"
import { devAndroid } from "./dev.ts"
import { install } from "./install.ts"
import { collectQt } from "./qt.ts"
import { createIgnoreFilter } from "./ignore.ts"
import { update } from "./update.ts"
import { startDesktopControl } from "./control.ts"
import { runMcp } from "./mcp.ts"
import { installSkill } from "./skill.ts"
import { ui } from "./ui.ts"

const [cmd, ...args] = process.argv.slice(2)

const NODE_BUILTIN =
  /^(node:|bun:|fs(\/promises)?$|path$|os$|child_process$|worker_threads$|net$|tls$|http$|https$|crypto$|stream$|buffer$|util$|assert$|url$|zlib$|events$|dns$|dgram$|cluster$|vm$|module$|readline$|repl$|tty$|v8$|perf_hooks$|async_hooks$|inspector$|trace_events$|.*\.node$)/

const buildTarget = (): BuildTarget => {
  const target = flagValue("--target") ?? "desktop"

  if (target !== "desktop" && target !== "android" && target !== "ios" && target !== "portable") {
    ui.error(`unknown target "${target}" (expected desktop, android, ios or portable)`)
    process.exit(1)
  }

  return target
}

const runtimeFor = (target: BuildTarget, manifest: AppManifest | null): RuntimeKind => {
  if (target === "portable") return "quickjs"

  return manifestRuntime(manifest, target)
}

/**
 * Picks the engine for a desktop build. QuickJS is the default, so the app
 * ships without Bun; Bun is bundled only when the code imports Node or Bun
 * APIs, or when the manifest or `--runtime` asks for it.
 */
const chooseDesktopEngine = async (
  appDir: string,
  manifest: AppManifest | null,
): Promise<{ engine: RuntimeKind; entry: string; reasons: string[] }> => {
  const flag = flagValue("--runtime")
  const forced = flag === "bun" || flag === "quickjs" || flag === "node" ? flag : explicitRuntime(manifest, "desktop")

  if (forced === "node") {
    return { engine: "node", entry: resolveEntry(appDir, manifest, "desktop", "node"), reasons: [] }
  }

  if (forced === "bun") {
    return {
      engine: "bun",
      entry: resolveEntry(appDir, manifest, "desktop", "bun"),
      reasons: ["the manifest or --runtime asks for it"],
    }
  }

  const entry = resolveEntry(appDir, manifest, "desktop", "quickjs")
  const violations = await auditPortable(entry)

  if (violations.length === 0) return { engine: "quickjs", entry, reasons: [] }

  if (manifestCompat(manifest) === "portable") {
    for (const violation of violations) ui.error(`not portable: ${violation}`)
    console.error('  the manifest sets "compat": "portable", usually because it targets Android')
    process.exit(1)
  }

  if (forced === "quickjs") {
    for (const violation of violations) ui.error(`not available on QuickJS: ${violation}`)
    process.exit(1)
  }

  return { engine: "bun", entry: resolveEntry(appDir, manifest, "desktop", "bun"), reasons: violations }
}

const describeVideo = (video: boolean, target: "desktop" | "android" = "desktop"): void => {
  if (target === "android") {
    ui.detail(
      "video",
      video
        ? "FFmpeg backend packaged, software decoding by default"
        : `not packaged, no video playback ${ui.dim('("video": true adds it)')}`,
    )

    return
  }

  if (video) {
    ui.detail("video", "in-app player bundled (FFmpeg, about 20 MB)")

    return
  }

  ui.detail("video", `not bundled, videos open in the system player ${ui.dim('("video": true adds the player)')}`)
}

/** Bundles the app for QuickJS; prints the errors and returns null when it fails. */
const quickjsBundleText = async (entry: string, assembly: string, sourcemap = false): Promise<string | null> => {
  const bundle = await bundleRuntime(entry, assembly, sourcemap).result

  if (bundle.success) return bundle.outputs[0]!.text()

  for (const log of bundle.logs) console.error(`[error] [pulsar] ${log.message}`)

  return null
}

/** The Node binary to run and ship: `PULSAR_NODE`, or `node` on the PATH. */
const findNode = (): string => {
  const node = process.env.PULSAR_NODE ?? Bun.which("node")

  if (!node) {
    console.error('pulsar: the app asks for "runtime": "node", but node is not installed or not on the PATH')
    process.exit(1)
  }

  return node
}

const BASE_LIBRARIES = /^(linux-vdso|ld-linux|libc|libm|libdl|librt|libpthread|libstdc\+\+|libgcc_s|libatomic)\b/

/**
 * Warns when the Node being shipped needs shared libraries from this system,
 * as distribution packages often do, so the app may not start elsewhere.
 */
const warnSharedNode = (node: string): void => {
  if (process.platform !== "linux") return

  const ldd = spawnSync("ldd", [node], { encoding: "utf8" })
  const shared = (ldd.stdout ?? "")
    .split("\n")
    .map((line) => line.trim().split(" ")[0] ?? "")
    .filter((name) => name.endsWith(".so") || /\.so\.\d/.test(name))
    .filter((name) => !BASE_LIBRARIES.test(name))

  if (shared.length === 0) return

  ui.warn(`this Node needs system libraries (${shared.slice(0, 4).join(", ")}${shared.length > 4 ? ", ..." : ""})`)
  ui.note("the app may not start on other machines; point PULSAR_NODE at an official build from nodejs.org")
}

/** Every package folder in node_modules, scoped ones included, as [name, path]. */
const packageFolders = (modules: string): Array<[string, string]> => {
  return readdirSync(modules, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .flatMap((entry): Array<[string, string]> => {
      const dir = join(modules, entry.name)

      if (!entry.name.startsWith("@")) return [[entry.name, dir]]

      return readdirSync(dir, { withFileTypes: true })
        .filter((scoped) => scoped.isDirectory())
        .map((scoped): [string, string] => [`${entry.name}/${scoped.name}`, join(dir, scoped.name)])
    })
}

interface NativePackages {
  /** Package names left out of the bundle. */
  external: string[]
  /** Package folders, relative to the app, that ship next to the bundle. */
  folders: string[]
}

/**
 * Finds packages with native addons, and the packages that load them. They
 * cannot go into a bundle, so they ship as a `node_modules` folder instead.
 */
const nativePackages = (appDir: string): NativePackages => {
  const modules = join(appDir, "node_modules")
  const packages = new Map<string, { dir: string; deps: string[] }>()

  if (!existsSync(modules)) return { external: [], folders: [] }

  const readPackage = (name: string, dir: string) => {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<string, Record<string, string>>
      const deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]

      packages.set(name, { dir, deps })
    } catch {
      // A package without a readable package.json cannot hold native code.
    }
  }

  for (const [name, dir] of packageFolders(modules)) readPackage(name, dir)

  const hasNative = (dir: string, depth = 0): boolean => {
    if (depth > 4) return false

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name.endsWith(".node") || entry.name === "binding.gyp")) return true
      if (entry.isDirectory() && entry.name !== "node_modules" && hasNative(join(dir, entry.name), depth + 1))
        return true
    }

    return false
  }

  const external = new Set([...packages].filter(([, pkg]) => hasNative(pkg.dir)).map(([name]) => name))

  for (let grew = true; grew;) {
    const loaders = [...packages].filter(
      ([name, pkg]) => !external.has(name) && pkg.deps.some((dep) => external.has(dep)),
    )

    for (const [name] of loaders) external.add(name)

    grew = loaders.length > 0
  }

  const folders = new Set<string>()
  const ship = (name: string) => {
    const pkg = packages.get(name)

    if (!pkg || folders.has(name)) return

    folders.add(name)
    pkg.deps.forEach(ship)
  }

  external.forEach(ship)

  return { external: [...external], folders: [...folders].map((name) => join("node_modules", name)) }
}

/**
 * Bundles the runtime and the app into one ES module for Node, which cannot
 * load TypeScript or JSX itself.
 */
const bundleForNode = async (entry: string, assembly: string, external: string[] = []): Promise<string | null> => {
  const root = pulsarRoot()
  const spec = (p: string) => JSON.stringify(p.replace(/\\/g, "/"))
  const entryPath = join(assembly, "node-entry.ts")

  writeFileSync(
    entryPath,
    [
      `process.env.PULSAR_BUNDLED = "1";`,
      `globalThis.__PULSAR_SDK_VERSION = ${JSON.stringify(cliVersion())};`,
      `const { wireApp } = await import(${spec(join(root, "core", "runtime", "main.ts"))});`,
      `await import(${spec(entry)});`,
      `wireApp();`,
      ``,
    ].join("\n"),
  )

  const plugin: BunPlugin = {
    name: "pulsar-node",
    setup(builder) {
      builder.onResolve({ filter: /^pulsar$/ }, () => ({ path: join(root, "core", "sdk", "index.ts") }))
      builder.onResolve({ filter: /^(pulsar|react)\/jsx-(dev-)?runtime$/ }, (args) => ({
        path: join(root, "core", "sdk", `${args.path.slice(args.path.indexOf("/") + 1)}.ts`),
      }))
    },
  }

  const result = await Bun.build({
    entrypoints: [entryPath],
    target: "node",
    format: "esm",
    plugins: [plugin],
    external,
  })

  if (!result.success) {
    for (const log of result.logs) console.error(`[error] [pulsar] ${log.message}`)

    return null
  }

  return result.outputs[0]!.text()
}

/** Says which engine the build uses, and why Bun is bundled when it is. */
const describeEngine = (chosen: { engine: RuntimeKind; reasons: string[] }): void => {
  if (chosen.engine === "quickjs") {
    ui.detail("engine", "QuickJS, Bun is not bundled")

    return
  }

  if (chosen.engine === "node") {
    ui.detail("engine", "Node from this machine, bundled into the app (roughly 20 to 40 MB)")

    return
  }

  ui.detail("engine", "Bun, bundled into the app (adds about 40 MB)")

  for (const reason of chosen.reasons.slice(0, 5)) ui.note(`  because of ${reason}`)

  if (chosen.reasons.length > 5) ui.note(`  and ${chosen.reasons.length - 5} more`)

  ui.note('to drop Bun, use Pulsar APIs there; to keep it quietly, set "runtime": { "desktop": "bun" }')
}

const BUN_GLOBAL = /(^|[^.\w])Bun\.[a-zA-Z]/m

const auditPortable = async (entry: string): Promise<string[]> => {
  const violations: string[] = []

  try {
    const plugin: BunPlugin = {
      name: "pulsar-portable-audit",
      setup(builder) {
        const sdk = join(pulsarRoot(), "core")

        builder.onResolve({ filter: /^pulsar$/ }, () => ({
          path: join(sdk, "sdk", "index.ts"),
        }))
        builder.onResolve({ filter: /^(pulsar|react)\/jsx-(dev-)?runtime$/ }, (args) => ({
          path: join(sdk, "sdk", `${args.path.slice(args.path.indexOf("/") + 1)}.ts`),
        }))
        builder.onResolve({ filter: NODE_BUILTIN }, (args) => {
          violations.push(`${args.path} (from ${args.importer})`)

          return { path: args.path, external: true }
        })
        builder.onLoad({ filter: /\.(m?[jt]sx?)$/ }, (args) => {
          const contents = readFileSync(args.path, "utf8")

          if (!args.path.startsWith(sdk) && BUN_GLOBAL.test(contents)) {
            violations.push(`the Bun global (in ${args.path})`)
          }

          const extension = args.path.split(".").pop() ?? "js"
          const loader =
            extension.startsWith("ts") || extension.startsWith("mts")
              ? extension.endsWith("x")
                ? "tsx"
                : "ts"
              : extension.endsWith("x")
                ? "jsx"
                : "js"

          return { contents, loader }
        })
      },
    }

    const config = {
      entrypoints: [entry],
      target: "browser",
      format: "esm",
      write: false,
      plugins: [plugin],
    } as unknown as Parameters<typeof Bun.build>[0]

    const result = await Bun.build(config)

    if (!result.success) violations.push(...result.logs.map((log) => log.message))
  } catch (e) {
    violations.push(e instanceof Error ? e.message : String(e))
  }

  return [...new Set(violations)]
}

const checkTarget = async (appDir: string, target: BuildTarget): Promise<void> => {
  const manifest = readManifest(appDir)
  const targets = manifestTargets(manifest)
  const compat: Compat = manifestCompat(manifest)
  const runtime = runtimeFor(target, manifest)
  const entry = resolveEntry(appDir, manifest, target)

  ui.header("check", target)
  ui.detail("entry", relative(appDir, entry))
  ui.detail("compat", compat)
  ui.detail("targets", targets.join(", "))

  if (target !== "desktop") ui.detail("runtime", runtime)

  if (target === "desktop") {
    describeEngine(await chooseDesktopEngine(appDir, manifest))
    describeVideo(wantsVideo(appDir, manifest))
  }

  if (target === "android") describeVideo(wantsVideo(appDir, manifest), "android")

  if (target === "android" && !targets.includes("android")) {
    ui.error(`android is not listed in targets (${targets.join(", ")})`)
    process.exit(1)
  }

  if (target === "android" && compat !== "portable") {
    ui.error('android requires compat: "portable"')
    process.exit(1)
  }

  if (compat !== "portable" && target !== "android" && target !== "portable") {
    ui.done("desktop compat, Node and Bun imports allowed")

    return
  }

  const violations = await auditPortable(entry)

  if (violations.length > 0) {
    for (const violation of violations) ui.error(`non-portable import: ${violation}`)
    process.exit(1)
  }

  ui.done("portable")
}

// Model B: the CLI needs Bun. Fail clearly instead of crashing under Node.
if (!(process.versions as { bun?: string }).bun) {
  ui.error("requires the Bun runtime (https://bun.sh). Install Bun, then run `pulsar` again.")
  process.exit(1)
}

const flagValue = (name: string): string | undefined => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === name) return args[i + 1]
    if (arg?.startsWith(name + "=")) return arg.slice(name.length + 1)
  }

  return undefined
}

const positional = (): string[] => {
  const flagsWithValue = new Set([
    "--path",
    "--id",
    "--event",
    "--into",
    "--out",
    "--at",
    "--duration",
    "--timeout",
    "--device",
    "--port",
    "--target",
    "--abi",
    "--version",
  ])
  const out: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!

    if (flagsWithValue.has(arg)) {
      i++
      continue
    }

    if (arg.startsWith("--")) continue

    out.push(arg)
  }

  return out
}

const runDevice = async (action: () => Promise<void>): Promise<void> => {
  try {
    await action()
  } catch (e) {
    ui.error(`${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

const warnToolchain = (): void => {
  const toolchain = toolchainVersion()
  const cli = cliVersion()

  if (!bundledToolchain() && toolchain && toolchain !== cli)
    ui.warn(`toolchain ${toolchain} != CLI ${cli}; run \`pulsar update\` or set PULSAR_SOURCE`)
}

/** Run the app once, on the engine its build would use. */
const run = async () => {
  await runDesktop(process.cwd(), false)
}

/** Run with hot reload: watch app sources and restart the runtime on change. */
const dev = async () => {
  const appDir = process.cwd()

  if (args.includes("--android")) {
    const portFlag = flagValue("--port")
    const port = portFlag ? Number.parseInt(portFlag, 10) : undefined

    if (portFlag && (!Number.isFinite(port) || port! <= 0)) {
      ui.error(`invalid --port ${portFlag}`)
      process.exit(1)
    }

    try {
      await devAndroid({
        appDir,
        device: flagValue("--device"),
        port,
        install: !args.includes("--no-install"),
        forceInstall: args.includes("--force-install"),
        keepAwake: !args.includes("--no-keep-awake"),
      })
    } catch (e) {
      ui.error(`${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }

    return
  }

  await runDesktop(appDir, true)
}

/** Runs the app on the desktop host, on the same engine as its build. */
const runDesktop = async (appDir: string, watchMode: boolean): Promise<void> => {
  warnToolchain()
  installDependencies(appDir)
  linkSdk(appDir, join(pulsarRoot(), "core", "sdk"))
  compileAppShaders(appDir)

  if (watchMode) watchAppShaders(appDir)

  const host = findHost()
  const manifest = readManifest(appDir)
  const chosen = await chooseDesktopEngine(appDir, manifest)

  ui.header(watchMode ? "dev" : "run", basename(appDir), watchMode ? "watching for changes" : "")
  describeEngine(chosen)

  // In dev the host also answers `pulsar ui`, `tap`, `hover` and the MCP server.
  const control = watchMode ? startDesktopControl(appDir, manifest?.name ?? basename(appDir)) : null
  const controlEnv = control ? { PULSAR_DEV_URL: control.url } : {}

  if (chosen.engine === "bun") {
    const bun = bunCommand()
    const child = Bun.spawn([host], {
      stdio: ["inherit", "inherit", "inherit"],
      env: {
        ...bun.env,
        ...controlEnv,
        BUN_BIN: bun.path,
        PULSAR_APP: appDir,
        PULSAR_ROOT: pulsarRoot(),
        ...(watchMode ? { PULSAR_WATCH: "1" } : {}),
      },
    })
    const stopBun = () => {
      child.kill()
      control?.stop()
      process.exit(130)
    }

    process.on("SIGINT", stopBun)
    process.on("SIGTERM", stopBun)

    const code = await child.exited

    control?.stop()
    process.exit(code)
  }

  // The same engine as the build: bundle for QuickJS or Node, and bundle again
  // on save. The host watches the bundle and restarts the runtime when it changes.
  const node = chosen.engine === "node"
  const native = node ? nativePackages(appDir) : { external: [], folders: [] }

  // Node resolves the native packages left out of the bundle from the app's
  // node_modules, so its bundle lives inside the app.
  if (node) mkdirSync(join(appDir, ".pulsar"), { recursive: true })

  const assembly = mkdtempSync(node ? join(appDir, ".pulsar", "dev-") : join(tmpdir(), "pulsar-dev-"))
  const bundleFile = join(assembly, node ? "runtime.mjs" : "runtime.js")

  const rebundle = async (): Promise<boolean> => {
    const text = node
      ? await bundleForNode(chosen.entry, assembly, native.external)
      : await quickjsBundleText(chosen.entry, assembly, true)

    if (text === null) return false

    writeFileSync(`${bundleFile}.tmp`, text)
    renameSync(`${bundleFile}.tmp`, bundleFile)

    return true
  }

  await rebundle()

  if (watchMode) {
    watchSources(appDir, manifest, () => {
      ui.step("change detected, reloading")
      void rebundle()
    })
  }

  const child = Bun.spawn([host], {
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      ...controlEnv,
      PULSAR_APP: appDir,
      PULSAR_ROOT: pulsarRoot(),
      ...(watchMode ? { PULSAR_WATCH: "1", PULSAR_RELOAD_FILE: bundleFile } : {}),
      ...(node
        ? { PULSAR_RUNTIME: findNode(), PULSAR_RUNTIME_SCRIPT: bundleFile, PULSAR_BRIDGE: findBridge(host) }
        : { PULSAR_QUICKJS_BUNDLE: bundleFile }),
    },
  })
  const stop = () => {
    child.kill()
    control?.stop()
    rmSync(assembly, { recursive: true, force: true })
    process.exit(130)
  }

  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)

  const code = await child.exited

  control?.stop()
  rmSync(assembly, { recursive: true, force: true })
  process.exit(code)
}

/** Calls `onChange` shortly after a source file of the app changes. */
const watchSources = (appDir: string, manifest: AppManifest | null, onChange: () => void): void => {
  const ignored = (name: string | null) =>
    !name || name === "storage.json" || name.startsWith(".") || name.endsWith(".lock") || name.endsWith(".qml")

  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timer) return

    timer = setTimeout(() => {
      timer = null
      onChange()
    }, 150)
  }

  const dirs = [
    { path: appDir, recursive: false },
    { path: dirname(resolve(appDir, manifest?.main ?? "main.ts")), recursive: true },
    { path: join(appDir, "ui"), recursive: false },
  ]

  for (const dir of dirs) {
    try {
      watch(dir.path, { recursive: dir.recursive }, (_event, filename) => {
        if (!ignored(filename)) schedule()
      })
    } catch {
      // The folder may not exist, such as an app without ui/.
    }
  }
}

const version = () => {
  console.log(`pulsar ${cliVersion()}`)
}

/** Check the toolchain and report what is missing. */
const doctor = () => {
  const lines: string[] = []
  let critical = true

  let host = ""

  try {
    host = findHost()
    lines.push(`ok    host binary: ${host}`)
  } catch (e) {
    critical = false
    lines.push(`FAIL  host binary: ${e instanceof Error ? e.message : e}`)
  }

  if (host) {
    try {
      lines.push(`ok    bridge binary: ${findBridge(host)}`)
    } catch (e) {
      critical = false
      lines.push(`FAIL  bridge binary: ${e instanceof Error ? e.message : e}`)
    }
  }

  const toolchain = toolchainVersion()
  const version = cliVersion()

  if (bundledToolchain()) lines.push(`ok    toolchain: ${version}, bundled with the CLI`)
  else if (!toolchain) lines.push("warn  toolchain: not installed (run `pulsar install`)")
  else if (toolchain !== version) lines.push(`warn  toolchain: ${toolchain} != CLI ${version} (run \`pulsar update\`)`)
  else lines.push(`ok    toolchain: ${toolchain}`)

  lines.push(`ok    bun: ${Bun.version ?? "unknown"}`)

  const qt = spawnSync("pkg-config", ["--modversion", "Qt6Core"], { encoding: "utf8" })

  const desktopQt = qt.status === 0 && qt.stdout ? qt.stdout.trim() : ""

  lines.push(
    desktopQt ? `ok    Qt6: ${desktopQt}` : `warn  Qt6: not found via pkg-config (the host may still be built)`,
  )

  if (desktopQt) {
    const desktopSeries = desktopQt.split(".").slice(0, 2).join(".")
    const androidSeries = ANDROID_QT_VERSION.split(".").slice(0, 2).join(".")

    lines.push(
      desktopSeries === androidSeries
        ? `ok    Qt parity: ${desktopSeries}`
        : `warn  Qt parity: desktop ${desktopQt} vs Android ${ANDROID_QT_VERSION} (metrics may differ)`,
    )
  }

  const manifest = join(process.cwd(), "pulsar.json")

  lines.push(
    existsSync(manifest) ? `ok    pulsar.json: ${manifest}` : `warn  pulsar.json: not found in ${process.cwd()}`,
  )

  ui.header("doctor", platformId())

  for (const line of lines) ui.status(line)

  process.exit(critical ? 0 : 1)
}

type PayloadEntry = {
  path: string
  data: Buffer
}

/** 64-bit FNV-1a over the payload shape; used as the extraction cache id. */
const fnv1a64 = (parts: string[]): bigint => {
  const prime = 0x100000001b3n
  const mask = (1n << 64n) - 1n

  let h = 0xcbf29ce484222325n

  for (const part of parts) {
    for (const byte of new TextEncoder().encode(part)) {
      h = (h ^ BigInt(byte)) & mask
      h = (h * prime) & mask
    }
  }

  return h
}

/** The native host/bridge, runtime and every app file (except build noise). */
/** Every file under `dir`, placed under `prefix` in the payload. */
const folderEntries = (dir: string, prefix: string): PayloadEntry[] => {
  const entries: PayloadEntry[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const rel = `${prefix}/${entry.name}`.replace(/\\/g, "/")

    if (entry.isDirectory()) entries.push(...folderEntries(path, rel))
    else if (entry.isFile()) entries.push({ path: rel, data: readFileSync(path) })
  }

  return entries
}

/** The app's own files, placed under `app/` in the payload. */
const collectPayload = (appDir: string, manifest: AppManifest | null, skipOut: string): PayloadEntry[] => {
  const entries: PayloadEntry[] = []
  const ignore = createIgnoreFilter(appDir, manifest, skipOut ? [skipOut] : [])

  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue

      const relPath = rel ? `${rel}/${entry.name}` : entry.name

      if (ignore.ignored(relPath, entry.isDirectory())) continue

      const abs = join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(abs, relPath)
        continue
      }

      if (entry.isFile()) entries.push({ path: `app/${relPath}`, data: readFileSync(abs) })
    }
  }

  walk(appDir, "")

  return entries
}

/** Serialize entries into the container read by the launcher; each file is one zstd frame. */
const encodeContainer = async (entries: PayloadEntry[], buildId: bigint): Promise<Buffer> => {
  const header = Buffer.alloc(20)

  header.write("PLSR", 0, "latin1")
  header.writeUInt32LE(2, 4)
  header.writeBigUInt64LE(buildId, 8)
  header.writeUInt32LE(entries.length, 16)

  const chunks: Buffer[] = [header]

  const packedAll = await Promise.all(entries.map((entry) => Bun.zstdCompress(entry.data, { level: 19 })))

  for (const [index, entry] of entries.entries()) {
    const pathBuf = Buffer.from(entry.path, "utf8")
    const pathLen = Buffer.alloc(4)
    const dataLen = Buffer.alloc(8)

    const packed = Buffer.from(packedAll[index]!)
    const packedLen = Buffer.alloc(8)

    pathLen.writeUInt32LE(pathBuf.length, 0)
    dataLen.writeBigUInt64LE(BigInt(entry.data.length), 0)
    packedLen.writeBigUInt64LE(BigInt(packed.length), 0)
    chunks.push(pathLen, pathBuf, dataLen, packedLen, packed)
  }

  return Buffer.concat(chunks)
}

const build = async () => {
  const appDir = process.cwd()

  compileAppShaders(appDir)
  const target = buildTarget()
  const manifest = readManifest(appDir)
  const compat = manifestCompat(manifest)
  const runtime = runtimeFor(target, manifest)
  const entry = resolveEntry(appDir, manifest, target)

  if (target === "android" && !manifestTargets(manifest).includes("android")) {
    ui.error(`android is not listed in targets (${manifestTargets(manifest).join(", ")})`)
    process.exit(1)
  }

  if (target === "android" && compat !== "portable") {
    console.error('pulsar build: android requires compat: "portable"')
    process.exit(1)
  }

  if (target === "ios" && !manifestTargets(manifest).includes("ios")) {
    ui.error(`ios is not listed in targets (${manifestTargets(manifest).join(", ")})`)
    process.exit(1)
  }

  if (target === "ios" && compat !== "portable") {
    console.error('pulsar build: ios requires compat: "portable"')
    process.exit(1)
  }

  if (target !== "desktop" && target !== "android" && target !== "ios") {
    ui.error(`--target ${target} is not implemented yet (runtime: ${runtime})`)
    process.exit(1)
  }

  const violations = compat === "portable" ? await auditPortable(entry) : []

  for (const violation of violations) ui.error(`non-portable import: ${violation}`)

  if (violations.length > 0) process.exit(1)

  if (target === "android") {
    const outDir = resolve(flagValue("--out") ?? flagValue("-o") ?? "dist")

    try {
      await buildAndroid({
        appDir,
        manifest,
        entry,
        outDir,
        abi: flagValue("--abi"),
        dev: args.includes("--dev"),
        aab: args.includes("--aab"),
      })
    } catch (e) {
      ui.error(`${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }

    return
  }

  if (target === "ios") {
    const outDir = resolve(flagValue("--out") ?? flagValue("-o") ?? "dist")

    try {
      await buildIos({ appDir, manifest, entry, outDir })
    } catch (e) {
      ui.error(`${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }

    return
  }

  const root = pulsarRoot()
  const runtimeTs = join(root, "core", "runtime", "main.ts")

  installDependencies(appDir)
  linkSdk(appDir, join(root, "core", "sdk"))
  compileAppShaders(appDir)

  if (!existsSync(runtimeTs)) {
    ui.error(`runtime not found at ${runtimeTs}`)
    process.exit(1)
  }

  const host = findHost()
  const launcher = findLauncher()
  const slim = args.includes("--slim")
  const outDir = resolve(flagValue("--out") ?? flagValue("-o") ?? "dist")
  const name = launcherName(appDir)
  const chosen = await chooseDesktopEngine(appDir, manifest)
  const video = wantsVideo(appDir, manifest)

  ui.header("build", basename(appDir), platformId())
  describeEngine(chosen)
  describeVideo(video)

  const assembly = mkdtempSync(join(tmpdir(), "pulsar-build-"))

  const pack = async (entries: PayloadEntry[]) => {
    if (!slim) collectQt(entries, host, video)

    const buildId = fnv1a64(entries.map((e) => `${e.path}:${e.data.length}`))
    const container = await encodeContainer(entries, buildId)
    const outerBytes = readFileSync(launcher)
    const trailer = Buffer.alloc(16)

    trailer.writeBigUInt64LE(BigInt(outerBytes.length), 0)
    trailer.write("PLSRPAYL", 8, "latin1")

    mkdirSync(outDir, { recursive: true })

    const fileName = process.platform === "win32" ? `${name}.exe` : name
    const finalPath = join(outDir, fileName)

    writeFileSync(finalPath, Buffer.concat([outerBytes, container, trailer]))
    chmodSync(finalPath, 0o755)

    const mb = (statSync(finalPath).size / (1024 * 1024)).toFixed(1)

    ui.done(`built ${finalPath} (${mb} MB)`)
    ui.note(`run it with ./${relative(process.cwd(), finalPath)}`)
  }

  const packQuickJs = async () => {
    const text = await quickjsBundleText(chosen.entry, assembly)

    if (text === null) process.exit(1)

    await pack([
      { path: "bin/qml-host", data: readFileSync(host) },
      { path: "runtime.js", data: Buffer.from(text) },
      ...collectPayload(appDir, manifest, basename(outDir)),
    ])
  }

  if (chosen.engine === "quickjs") {
    try {
      await packQuickJs()
    } finally {
      rmSync(assembly, { recursive: true, force: true })
    }

    return
  }

  const bridge = findBridge(host)

  const packNode = async () => {
    const nodeBinary = findNode()

    warnSharedNode(nodeBinary)

    const native = nativePackages(appDir)
    const script = await bundleForNode(chosen.entry, assembly, native.external)

    if (script === null) process.exit(1)

    if (native.external.length > 0) ui.detail("native", native.external.join(", "))

    await pack([
      { path: "bin/qml-host", data: readFileSync(host) },
      { path: "bin/bridge", data: readFileSync(bridge) },
      { path: process.platform === "win32" ? "bin/node.exe" : "bin/node", data: readFileSync(nodeBinary) },
      { path: "runtime.mjs", data: Buffer.from(script) },
      ...native.folders.flatMap((folder) => folderEntries(join(appDir, folder), folder)),
      ...collectPayload(appDir, manifest, basename(outDir)),
    ])
  }

  if (chosen.engine === "node") {
    try {
      await packNode()
    } finally {
      rmSync(assembly, { recursive: true, force: true })
    }

    return
  }

  try {
    // One entry pulls the runtime and the app into a single module graph, so
    // App.current and the capability registry are shared, then wires the host.
    const spec = (p: string) => JSON.stringify(p.replace(/\\/g, "/"))
    const entryPath = join(assembly, "entry.ts")

    writeFileSync(
      entryPath,
      [
        `process.env.PULSAR_BUNDLED = "1";`,
        `globalThis.__PULSAR_SDK_VERSION = ${JSON.stringify(cliVersion())};`,
        `const { wireApp } = await import(${spec(runtimeTs)});`,
        `await import(${spec(chosen.entry)});`,
        `wireApp();`,
        ``,
      ].join("\n"),
    )

    const runtimeOut = join(assembly, process.platform === "win32" ? "runtime.exe" : "runtime")
    const compile = spawnSync(bunCommand().path, ["build", entryPath, "--compile", "--outfile", runtimeOut], {
      cwd: appDir,
      stdio: "inherit",
      env: bunCommand().env,
    })

    if (compile.status !== 0 || !existsSync(runtimeOut)) {
      ui.error("runtime compilation failed")
      process.exit(1)
    }

    // The outer binary is the Qt-free launcher; it extracts the payload and
    // exec()s the bundled host (which loads the bundled Qt via its RPATH).
    await pack([
      { path: "bin/qml-host", data: readFileSync(host) },
      { path: "bin/bridge", data: readFileSync(bridge) },
      { path: "runtime", data: readFileSync(runtimeOut) },
      ...collectPayload(appDir, manifest, basename(outDir)),
    ])
  } finally {
    rmSync(assembly, { recursive: true, force: true })
  }
}

/** Legacy alias: scaffold the default template into the current directory. */
const init = () => {
  const name = basename(process.cwd())

  create([name, "--dir", dirname(process.cwd()), "--force"])
}

const COMMANDS: Array<[string, Array<[string, string]>]> = [
  [
    "Start",
    [
      ["create <name>", "scaffold a new app (--template default|js|qml|windows|tray)"],
      ["dev", "run with live reload (--android for the dev APK)"],
      ["run", "run the app in the current directory"],
    ],
  ],
  [
    "Build",
    [
      ["build", "build one file (--target desktop|android|ios, --runtime bun|quickjs|node, --slim)"],
      ["check", "show the engine a build uses and whether Bun is bundled"],
    ],
  ],
  [
    "Device",
    [
      ["ui", "dump the running dev app's UI tree (--system for uiautomator)"],
      ["state", "dump the running dev app's store"],
      ["tap <text>", "press a node by text (--path|--id|--event|--at x,y)"],
      ["perf <file>", "play timed input from a JSON scenario and report frame pacing (--out report.json)"],
      ["hover <text>", "move the pointer over a node, desktop (--leave)"],
      ["scroll <text>", "turn the wheel over a node, desktop (--dy px, default 120)"],
      ["keys <text>", "type key by key into the focused field, desktop"],
      ["type <text>", "send input to a field (--into <label>)"],
      ["toggle <text>", "toggle a checkbox or switch"],
      ["select <t> <v>", "choose a select option"],
      ["expect <text>", "wait until the text appears (--timeout ms)"],
      ["shot", "screenshot the device (--out, --window)"],
      ["swipe x1 y1 x2 y2", "swipe on the screen (--duration ms)"],
      ["key <name>", "send a key (back, enter, ... ; ctrl+n on the desktop)"],
      ["eval <code>", "evaluate JS in the running app"],
      ["back", "send the Android back event"],
      ["reload", "restart the running app"],
    ],
  ],
  [
    "Agents",
    [
      ["mcp", "MCP server on stdio: AI agents start, see and drive your app"],
      ["skill", "install the agent skill in .claude/skills (--global, --dir <path>)"],
    ],
  ],
  [
    "Toolchain",
    [
      ["install", "download the native toolchain (--android for the APK toolchain)"],
      ["update", "update the CLI to the latest release (--version <v>)"],
      ["doctor", "check the toolchain"],
      ["version", "print the version"],
    ],
  ],
]

const usage = () => {
  ui.banner(cliVersion())

  for (const [title, commands] of COMMANDS) {
    console.log(`  ${ui.bold(title)}`)

    for (const [name, text] of commands) console.log(`    ${ui.code(name.padEnd(18))} ${ui.dim(text)}`)

    console.log("")
  }

  console.log(`  ${ui.dim("Docs:")} https://pulsarjs.org`)
  console.log("")
}

const installCommand = async () => {
  if (!args.includes("--android")) {
    await install(args)

    return
  }

  try {
    const tools = await installAndroid(flagValue("--version"))

    ui.step(`android toolchain ready (qt ${tools.qt})`)
  } catch (e) {
    ui.error(`${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

const nodeQuery = (): TapQuery => {
  const [text] = positional()
  const idFlag = flagValue("--id")

  return { text, path: flagValue("--path"), id: idFlag ? Number.parseInt(idFlag, 10) : undefined }
}

const tapCommand = async () => {
  const at = flagValue("--at")

  if (at) {
    const [x, y] = at.split(",").map((part) => Number.parseFloat(part.trim()))

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      ui.error(`invalid --at ${at} (expected x,y)`)
      process.exit(1)
    }

    await runDevice(() => deviceTapAt(process.cwd(), x!, y!))

    return
  }

  const [text] = positional()
  const idFlag = flagValue("--id")

  await runDevice(() =>
    deviceTap(process.cwd(), {
      text,
      path: flagValue("--path"),
      id: idFlag ? Number.parseInt(idFlag, 10) : undefined,
      event: flagValue("--event"),
    }),
  )
}

switch (cmd) {
  case "create":
    create(args)
    break
  case "install":
    await installCommand()
    break
  case "update":
    await update(args)
    break
  case "dev":
    await dev()
    break
  case "run":
    await run()
    break
  case "init":
    init()
    break
  case "build":
    await build()
    break
  case "check":
    await checkTarget(process.cwd(), buildTarget())
    break
  case "ui":
    await runDevice(() => deviceUI(process.cwd(), args.includes("--system")))
    break
  case "state":
    await runDevice(() => deviceState(process.cwd()))
    break
  case "tap":
    await tapCommand()
    break
  case "mcp":
    runMcp()
    break
  case "skill": {
    const target = installSkill({ global: args.includes("--global"), dir: flagValue("--dir") })

    ui.step(`installed the Pulsar skill in ${target}`)
    break
  }
  case "hover":
    await runDevice(() => deviceHover(process.cwd(), nodeQuery(), args.includes("--leave")))
    break
  case "perf":
    await runDevice(() => devicePerf(process.cwd(), positional()[0] ?? "", flagValue("--out")))
    break
  case "scroll":
    await runDevice(() => deviceScroll(process.cwd(), nodeQuery(), Number(flagValue("--dy") ?? 120)))
    break
  case "keys":
    await runDevice(() => deviceKeys(process.cwd(), positional().join(" ")))
    break
  case "swipe": {
    const points = positional().map((value) => Number.parseFloat(value))
    const durationFlag = flagValue("--duration")
    const duration = durationFlag ? Number.parseInt(durationFlag, 10) : undefined

    if (points.length < 4 || points.some((value) => !Number.isFinite(value))) {
      ui.error("expected x1 y1 x2 y2 [--duration ms]")
      process.exit(1)
    }

    await runDevice(() => deviceSwipe(process.cwd(), [points[0]!, points[1]!], [points[2]!, points[3]!], duration))
    break
  }
  case "key":
    await runDevice(() => deviceKey(process.cwd(), positional()[0] ?? ""))
    break
  case "eval":
    await runDevice(() => deviceEval(process.cwd(), positional().join(" ")))
    break
  case "type":
    await runDevice(() => deviceType(process.cwd(), positional().join(" "), flagValue("--into")))
    break
  case "toggle": {
    const flag = flagValue("--value")
    const value = flag === undefined ? undefined : flag === "true"

    await runDevice(() => deviceToggle(process.cwd(), positional()[0] ?? "", value))
    break
  }
  case "select": {
    const [text, value] = positional()

    await runDevice(() => deviceSelect(process.cwd(), text ?? "", value ?? ""))
    break
  }
  case "back":
    await runDevice(() => deviceBack(process.cwd()))
    break
  case "reload":
    await runDevice(() => deviceReload(process.cwd()))
    break
  case "expect":
    await runDevice(() => deviceExpect(process.cwd(), positional().join(" "), Number(flagValue("--timeout") ?? 5000)))
    break
  case "shot":
    await runDevice(() => deviceShot(process.cwd(), flagValue("--out"), args.includes("--window")))
    break
  case "doctor":
    doctor()
    break
  case "version":
  case "-v":
  case "--version":
    version()
    break
  case "help":
  case "-h":
  case "--help":
    usage()
    break
  default:
    usage()
    process.exit(cmd ? 1 : 0)
}
