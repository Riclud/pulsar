#!/usr/bin/env bun
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
import { cliVersion, findBridge, findHost, findLauncher, pulsarRoot } from "./core.ts"
import { create } from "./create.ts"
import { install } from "./install.ts"
import { collectQt } from "./qt.ts"
import { update } from "./update.ts"

const [cmd, ...args] = process.argv.slice(2)

// Model B: the CLI needs Bun. Fail clearly instead of crashing under Node.
if (!(process.versions as { bun?: string }).bun) {
  console.error("pulsar: requires the Bun runtime (https://bun.sh). Install Bun, then run `pulsar` again.")
  process.exit(1)
}

function flagValue(name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === name) return args[i + 1]
    if (arg?.startsWith(name + "=")) return arg.slice(name.length + 1)
  }
  return undefined
}

/** Output name from the manifest, falling back to package.json. */
function launcherName(dir: string): string {
  for (const file of ["pulsar.json", "package.json"]) {
    try {
      const name = JSON.parse(readFileSync(join(dir, file), "utf8")).name
      if (typeof name === "string" && name.length > 0)
        return name.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
    } catch {}
  }
  return "app"
}

function run() {
  const appDir = process.cwd()
  const host = findHost()
  const r = spawnSync(host, [], {
    stdio: "inherit",
    env: { ...process.env, PULSAR_APP: appDir, PULSAR_ROOT: pulsarRoot() },
  })
  process.exit(r.status ?? 0)
}

/** Run with hot reload: watch app sources and restart the runtime on change. */
function dev() {
  const appDir = process.cwd()
  const host = findHost()
  console.log("pulsar: dev mode (watching for changes)")
  const r = spawnSync(host, [], {
    stdio: "inherit",
    env: { ...process.env, PULSAR_APP: appDir, PULSAR_ROOT: pulsarRoot(), PULSAR_WATCH: "1" },
  })
  process.exit(r.status ?? 0)
}

function version() {
  console.log(`pulsar ${cliVersion()}`)
}

/** Check the toolchain and report what is missing. */
function doctor() {
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

  lines.push(`ok    bun: ${Bun.version ?? "unknown"}`)

  const qt = spawnSync("pkg-config", ["--modversion", "Qt6Core"], { encoding: "utf8" })
  if (qt.status === 0 && qt.stdout) lines.push(`ok    Qt6: ${qt.stdout.trim()}`)
  else lines.push(`warn  Qt6: not found via pkg-config (the host may still be built)`)

  const manifest = join(process.cwd(), "pulsar.json")
  lines.push(
    existsSync(manifest) ? `ok    pulsar.json: ${manifest}` : `warn  pulsar.json: not found in ${process.cwd()}`,
  )

  console.log(lines.join("\n"))
  process.exit(critical ? 0 : 1)
}

type PayloadEntry = { path: string; data: Buffer }

/** 64-bit FNV-1a over the payload shape; used as the extraction cache id. */
function fnv1a64(parts: string[]): bigint {
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
function collectPayload(
  appDir: string,
  runtime: string,
  bridge: string,
  host: string,
  skipOut: string,
): PayloadEntry[] {
  const entries: PayloadEntry[] = [
    { path: "bin/qml-host", data: readFileSync(host) },
    { path: "bin/bridge", data: readFileSync(bridge) },
    { path: "runtime", data: readFileSync(runtime) },
  ]
  const skip = new Set(["node_modules", ".git", "dist", "build", ".cache", skipOut])
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || skip.has(entry.name)) continue
      const abs = join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(abs, relPath)
      else if (entry.isFile()) entries.push({ path: `app/${relPath}`, data: readFileSync(abs) })
    }
  }
  walk(appDir, "")
  return entries
}

/** Serialize entries into the container format read by `host/embedded.cpp`. */
function encodeContainer(entries: PayloadEntry[], buildId: bigint): Buffer {
  const header = Buffer.alloc(20)
  header.write("PLSR", 0, "latin1")
  header.writeUInt32LE(1, 4)
  header.writeBigUInt64LE(buildId, 8)
  header.writeUInt32LE(entries.length, 16)

  const chunks: Buffer[] = [header]
  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.path, "utf8")
    const pathLen = Buffer.alloc(4)
    pathLen.writeUInt32LE(pathBuf.length, 0)
    const dataLen = Buffer.alloc(8)
    dataLen.writeBigUInt64LE(BigInt(entry.data.length), 0)
    chunks.push(pathLen, pathBuf, dataLen, entry.data)
  }
  return Buffer.concat(chunks)
}

async function build() {
  const appDir = process.cwd()
  const mainTs = join(appDir, "main.ts")
  if (!existsSync(mainTs)) {
    console.error("pulsar build: no main.ts in the current directory")
    process.exit(1)
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
        `await import(${spec(mainTs)});`,
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
function init() {
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

function usage() {
  console.log(LOGO)
  console.log(
    [
      "pulsar <command>",
      "",
      "  create <name>  scaffold a new app (--template default|windows|tray)",
      "  install        download the native toolchain for this platform",
      "  update         update the CLI to the latest release",
      "  dev            run with hot reload (watch sources)",
      "  run            run the app in the current directory",
      "  build          build a single-file executable",
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
    await install(args)
    break
  case "update":
    await update()
    break
  case "dev":
    dev()
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
