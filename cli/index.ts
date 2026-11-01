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
  rmSync,
  statSync,
  writeFileSync,
} from "fs"
import { tmpdir } from "os"
import { basename, dirname, join, resolve } from "path"
import {
  manifestCompat,
  manifestRuntime,
  manifestTargets,
  type AppManifest,
  type Compat,
  type RuntimeKind,
} from "../core/sdk/manifest.ts"
import { cliVersion, findBridge, findHost, findLauncher, pulsarRoot, toolchainVersion } from "./core.ts"
import { buildAndroid, installAndroid } from "./android.ts"
import { launcherName, readManifest, resolveEntry, type BuildTarget } from "./app.ts"
import { create } from "./create.ts"
import {
  deviceBack,
  deviceEval,
  deviceExpect,
  deviceKey,
  deviceReload,
  deviceSelect,
  deviceShot,
  deviceState,
  deviceSwipe,
  deviceTap,
  deviceTapAt,
  deviceToggle,
  deviceType,
  deviceUI,
} from "./device.ts"
import { devAndroid } from "./dev.ts"
import { install } from "./install.ts"
import { collectQt } from "./qt.ts"
import { update } from "./update.ts"

const [cmd, ...args] = process.argv.slice(2)

const NODE_BUILTIN =
  /^(node:|bun:|fs(\/promises)?$|path$|os$|child_process$|worker_threads$|net$|tls$|http$|https$|crypto$|stream$|buffer$|util$|assert$|url$|zlib$|events$|dns$|dgram$|cluster$|vm$|module$|readline$|repl$|tty$|v8$|perf_hooks$|async_hooks$|inspector$|trace_events$|.*\.node$)/

const buildTarget = (): BuildTarget => {
  const target = flagValue("--target") ?? "desktop"

  if (target !== "desktop" && target !== "android" && target !== "portable") {
    console.error(`pulsar: unknown target "${target}" (expected desktop, android or portable)`)
    process.exit(1)
  }

  return target
}

const runtimeFor = (target: BuildTarget, manifest: AppManifest | null): RuntimeKind => {
  if (target === "portable") return "quickjs"

  return manifestRuntime(manifest, target)
}

const auditPortable = async (entry: string): Promise<string[]> => {
  const violations: string[] = []

  try {
    const plugin: BunPlugin = {
      name: "pulsar-portable-audit",
      setup(builder) {
        builder.onResolve({ filter: /^pulsar$/ }, () => ({
          path: join(pulsarRoot(), "core", "sdk", "index.ts"),
        }))
        builder.onResolve({ filter: NODE_BUILTIN }, (args) => {
          violations.push(`${args.path} (from ${args.importer})`)
          return { path: args.path, external: true }
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

    if (!result.success) {
      for (const log of result.logs) violations.push(log.message)
    }
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

  console.log(`pulsar check --target ${target}`)
  console.log(`  entry: ${entry}`)
  console.log(`  runtime: ${runtime}`)
  console.log(`  compat: ${compat}`)
  console.log(`  targets: ${targets.join(", ")}`)

  if (target === "android" && !targets.includes("android")) {
    console.error(`FAIL  android is not listed in targets (${targets.join(", ")})`)
    process.exit(1)
  }

  if (target === "android" && compat !== "portable") {
    console.error('FAIL  android requires compat: "portable"')
    process.exit(1)
  }

  if (compat !== "portable" && target !== "android" && target !== "portable") {
    console.log("ok    desktop compat, node/bun imports allowed")
    return
  }

  const violations = await auditPortable(entry)

  if (violations.length > 0) {
    for (const violation of violations) console.error(`FAIL  non-portable import: ${violation}`)
    process.exit(1)
  }

  console.log("ok    portable")
}

// Model B: the CLI needs Bun. Fail clearly instead of crashing under Node.
if (!(process.versions as { bun?: string }).bun) {
  console.error("pulsar: requires the Bun runtime (https://bun.sh). Install Bun, then run `pulsar` again.")
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
    console.error(`pulsar: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

const run = () => {
  const appDir = process.cwd()
  const host = findHost()
  const r = spawnSync(host, [], {
    stdio: "inherit",
    env: { ...process.env, PULSAR_APP: appDir, PULSAR_ROOT: pulsarRoot() },
  })

  process.exit(r.status ?? 0)
}

/** Run with hot reload: watch app sources and restart the runtime on change. */
const dev = async () => {
  const appDir = process.cwd()

  if (args.includes("--android")) {
    const portFlag = flagValue("--port")
    const port = portFlag ? Number.parseInt(portFlag, 10) : undefined

    if (portFlag && (!Number.isFinite(port) || port! <= 0)) {
      console.error(`pulsar dev: invalid --port ${portFlag}`)
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
      console.error(`pulsar dev: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }

    return
  }

  const host = findHost()

  console.log("pulsar: dev mode (watching for changes)")

  const r = spawnSync(host, [], {
    stdio: "inherit",
    env: { ...process.env, PULSAR_APP: appDir, PULSAR_ROOT: pulsarRoot(), PULSAR_WATCH: "1" },
  })

  process.exit(r.status ?? 0)
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

  if (!toolchain) lines.push("warn  toolchain: not installed (run `pulsar install`)")
  else if (toolchain !== version) lines.push(`warn  toolchain: ${toolchain} != CLI ${version} (run \`pulsar update\`)`)
  else lines.push(`ok    toolchain: ${toolchain}`)

  lines.push(`ok    bun: ${Bun.version ?? "unknown"}`)

  const qt = spawnSync("pkg-config", ["--modversion", "Qt6Core"], { encoding: "utf8" })

  lines.push(
    qt.status === 0 && qt.stdout
      ? `ok    Qt6: ${qt.stdout.trim()}`
      : `warn  Qt6: not found via pkg-config (the host may still be built)`,
  )

  const manifest = join(process.cwd(), "pulsar.json")

  lines.push(
    existsSync(manifest) ? `ok    pulsar.json: ${manifest}` : `warn  pulsar.json: not found in ${process.cwd()}`,
  )

  console.log(lines.join("\n"))
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
const collectPayload = (
  appDir: string,
  runtime: string,
  bridge: string,
  host: string,
  skipOut: string,
): PayloadEntry[] => {
  const entries: PayloadEntry[] = [
    { path: "bin/qml-host", data: readFileSync(host) },
    { path: "bin/bridge", data: readFileSync(bridge) },
    { path: "runtime", data: readFileSync(runtime) },
  ]
  const skip = new Set(["node_modules", ".git", "dist", "build", ".cache", skipOut])

  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || skip.has(entry.name)) continue

      const abs = join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name

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

/** Serialize entries into the container format read by `host/embedded.cpp`. */
const encodeContainer = (entries: PayloadEntry[], buildId: bigint): Buffer => {
  const header = Buffer.alloc(20)

  header.write("PLSR", 0, "latin1")
  header.writeUInt32LE(1, 4)
  header.writeBigUInt64LE(buildId, 8)
  header.writeUInt32LE(entries.length, 16)

  const chunks: Buffer[] = [header]

  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.path, "utf8")
    const pathLen = Buffer.alloc(4)
    const dataLen = Buffer.alloc(8)

    pathLen.writeUInt32LE(pathBuf.length, 0)
    dataLen.writeBigUInt64LE(BigInt(entry.data.length), 0)
    chunks.push(pathLen, pathBuf, dataLen, entry.data)
  }

  return Buffer.concat(chunks)
}

const build = async () => {
  const appDir = process.cwd()
  const target = buildTarget()
  const manifest = readManifest(appDir)
  const compat = manifestCompat(manifest)
  const runtime = runtimeFor(target, manifest)
  const entry = resolveEntry(appDir, manifest, target)

  if (target === "android" && !manifestTargets(manifest).includes("android")) {
    console.error(`pulsar build: android is not listed in targets (${manifestTargets(manifest).join(", ")})`)
    process.exit(1)
  }

  if (target === "android" && compat !== "portable") {
    console.error('pulsar build: android requires compat: "portable"')
    process.exit(1)
  }

  if (target !== "desktop" && target !== "android") {
    console.error(`pulsar build: --target ${target} is not implemented yet (runtime: ${runtime})`)
    process.exit(1)
  }

  if (compat === "portable") {
    const violations = await auditPortable(entry)

    if (violations.length > 0) {
      for (const violation of violations) console.error(`pulsar build: non-portable import: ${violation}`)
      process.exit(1)
    }
  }

  if (target === "android") {
    const outDir = resolve(flagValue("--out") ?? flagValue("-o") ?? "dist")

    try {
      await buildAndroid({ appDir, manifest, entry, outDir, abi: flagValue("--abi"), dev: args.includes("--dev") })
    } catch (e) {
      console.error(`pulsar build: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }

    return
  }

  const root = pulsarRoot()
  const runtimeTs = join(root, "core", "runtime", "main.ts")

  if (!existsSync(runtimeTs)) {
    console.error(`pulsar build: runtime not found at ${runtimeTs}`)
    process.exit(1)
  }

  const host = findHost()
  const bridge = findBridge(host)
  const launcher = findLauncher()
  const slim = args.includes("--slim")
  const outDir = resolve(flagValue("--out") ?? flagValue("-o") ?? "dist")
  const name = launcherName(appDir)

  console.log(`pulsar: building ${basename(appDir)} -> ${join(outDir, name)}`)

  const assembly = mkdtempSync(join(tmpdir(), "pulsar-build-"))

  try {
    // One entry pulls the runtime and the app into a single module graph, so
    // App.current and the capability registry are shared, then wires the host.
    const spec = (p: string) => JSON.stringify(p.replace(/\\/g, "/"))
    const entryPath = join(assembly, "entry.ts")

    writeFileSync(
      entryPath,
      [
        `process.env.PULSAR_BUNDLED = "1";`,
        `const { wireApp } = await import(${spec(runtimeTs)});`,
        `await import(${spec(entry)});`,
        `wireApp();`,
        ``,
      ].join("\n"),
    )

    const runtimeOut = join(assembly, process.platform === "win32" ? "runtime.exe" : "runtime")
    const compile = spawnSync(process.execPath, ["build", entryPath, "--compile", "--outfile", runtimeOut], {
      cwd: appDir,
      stdio: "inherit",
    })

    if (compile.status !== 0 || !existsSync(runtimeOut)) {
      console.error("pulsar build: runtime compilation failed")
      process.exit(1)
    }

    const entries = collectPayload(appDir, runtimeOut, bridge, host, basename(outDir))

    if (!slim) collectQt(entries, host)

    const buildId = fnv1a64(entries.map((e) => `${e.path}:${e.data.length}`))
    const container = encodeContainer(entries, buildId)

    // The outer binary is the Qt-free launcher; it extracts the payload and
    // exec()s the bundled host (which loads the bundled Qt via its RPATH).
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

    console.log(`pulsar: built ${finalPath} (${mb} MB)`)
    console.log(`  run it with ./${fileName}`)
  } finally {
    rmSync(assembly, { recursive: true, force: true })
  }
}

/** Legacy alias: scaffold the default template into the current directory. */
const init = () => {
  const name = basename(process.cwd())

  create([name, "--dir", dirname(process.cwd()), "--force"])
}

const LOGO = String.raw`
                     /$$                              
                    | $$                              
  /$$$$$$  /$$   /$$| $$  /$$$$$$$  /$$$$$$   /$$$$$$ 
 /$$__  $$| $$  | $$| $$ /$$_____/ |____  $$ /$$__  $$
| $$  \ $$| $$  | $$| $$|  $$$$$$   /$$$$$$$| $$  \__/
| $$  | $$| $$  | $$| $$ \____  $$ /$$$$$$$| $$      
| $$$$$$$/|  $$$$$$/| $$ /$$$$$$$/|  $$$$$$$| $$      
| $$____/  \______/ |__/|_______/  \_______/|__/      
| $$                                                  
| $$                                                  
|__/ 
`

const usage = () => {
  console.log(LOGO)
  console.log(
    [
      "pulsar <command>",
      "",
      "  create <name>  scaffold a new app (--template default|js|qml|windows|tray)",
      "  install        download the native toolchain for this platform (--android for the APK toolchain)",
      "  update         update the CLI to the latest release",
      "  dev            run with hot reload (watch sources; --android for the dev APK)",
      "  run            run the app in the current directory",
      "  build          build a single-file executable (--target desktop|android|portable, --dev)",
      "  check          audit a target for portable imports (--target android)",
      "  ui             dump the running dev app's UI tree (JSON; --system for uiautomator)",
      "  state          dump the running dev app's store (JSON)",
      "  tap <text>     press a node by text (--path|--id|--event|--at x,y)",
      "  type <text>    send input to a field (--into <label>)",
      "  toggle <text>  toggle a checkbox or switch",
      "  select <t> <v> choose a select option",
      "  expect <text>  wait until the text appears (--timeout ms)",
      "  shot           screenshot the device (--out, --window)",
      "  swipe x1 y1 x2 y2  swipe on the screen (--duration ms)",
      "  key <name>     send an Android key (back, home, enter, ... or a code)",
      "  eval <code>    evaluate JS in the running app",
      "  back           send the Android back event",
      "  reload         restart the running app",
      "  doctor         check the toolchain (host, bridge, Qt, Bun)",
      "  version        print the version",
      "",
      "  -h, --help     show this help",
      "  -v, --version  print the version",
    ].join("\n"),
  )
}

switch (cmd) {
  case "create":
    create(args)
    break
  case "install":
    if (args.includes("--android")) {
      try {
        const tools = await installAndroid(flagValue("--version"))
        console.log(`pulsar: android toolchain ready (qt ${tools.qt})`)
      } catch (e) {
        console.error(`pulsar install: ${e instanceof Error ? e.message : String(e)}`)
        process.exit(1)
      }
    } else {
      await install(args)
    }
    break
  case "update":
    await update()
    break
  case "dev":
    await dev()
    break
  case "run":
    run()
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
  case "tap": {
    const at = flagValue("--at")

    if (at) {
      const [x, y] = at.split(",").map((part) => Number.parseFloat(part.trim()))

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        console.error(`pulsar tap: invalid --at ${at} (expected x,y)`)
        process.exit(1)
      }

      await runDevice(() => deviceTapAt(process.cwd(), x!, y!))
      break
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
    break
  }
  case "swipe": {
    const points = positional().map((value) => Number.parseFloat(value))
    const durationFlag = flagValue("--duration")
    const duration = durationFlag ? Number.parseInt(durationFlag, 10) : undefined

    if (points.length < 4 || points.some((value) => !Number.isFinite(value))) {
      console.error("pulsar swipe: expected x1 y1 x2 y2 [--duration ms]")
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
