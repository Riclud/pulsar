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

const [cmd, ...args] = process.argv.slice(2)

const MAIN_TS = `import { App } from "pulsar";

const app = new App();

app.store.set("greeting", "Hello from Pulsar");

app.on("hello", (params: { name: string }) => {
  app.store.set("greeting", \`Hello, \${params.name}!\`);
});

app.run();
`

const MAIN_QML = `import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true

    Column {
        anchors.centerIn: parent
        spacing: 12
        Label { text: Store.greeting || "" }
        Button {
            text: "Call backend"
            onClicked: Pulsar.emit("hello", { name: "World" })
        }
    }
}
`

const MAIN_JSON = `{
  "id": "com.example.myapp",
  "name": "my-app",
  "version": "0.1.0",
  "main": "main.ts",
  "windows": [
    {
      "label": "main",
      "ui": "ui/main.qml",
      "width": 800,
      "height": 600,
      "title": "My App"
    }
  ],
  "permissions": []
}
`

function findHost(): string {
  const fromEnv = process.env.PULSAR_HOST
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const candidates = [resolve(import.meta.dir, "..", "zig-out", "bin", "qml-host"), "/usr/local/bin/pulsar-host"]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error("pulsar host binary not found (set PULSAR_HOST)")
}

function findBridge(host: string): string {
  const fromEnv = process.env.PULSAR_BRIDGE
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const candidates = [join(dirname(host), "bridge"), resolve(import.meta.dir, "..", "zig-out", "bin", "bridge")]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error("pulsar bridge binary not found (set PULSAR_BRIDGE)")
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
    env: { ...process.env, PULSAR_APP: appDir },
  })
  process.exit(r.status ?? 0)
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

/** The runtime executable plus every app file (except build noise). */
function collectPayload(appDir: string, runtime: string, bridge: string, skipOut: string): PayloadEntry[] {
  const entries: PayloadEntry[] = [
    { path: basename(runtime), data: readFileSync(runtime) },
    { path: basename(bridge), data: readFileSync(bridge) },
  ]
  const skip = new Set(["node_modules", ".git", "dist", ".zig-cache", ".cache", skipOut])
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

  const root = resolve(import.meta.dir, "..")
  const runtimeTs = join(root, "core", "runtime", "main.ts")
  if (!existsSync(runtimeTs)) {
    console.error(`pulsar build: runtime not found at ${runtimeTs}`)
    process.exit(1)
  }

  const host = findHost()
  const bridge = findBridge(host)
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

    const entries = collectPayload(appDir, runtimeOut, bridge, basename(outDir))
    const buildId = fnv1a64(entries.map((e) => `${e.path}:${e.data.length}`))
    const container = encodeContainer(entries, buildId)

    const hostBytes = readFileSync(host)
    const trailer = Buffer.alloc(16)
    trailer.writeBigUInt64LE(BigInt(hostBytes.length), 0)
    trailer.write("PLSRPAYL", 8, "latin1")

    mkdirSync(outDir, { recursive: true })
    const fileName = process.platform === "win32" ? `${name}.exe` : name
    const finalPath = join(outDir, fileName)
    writeFileSync(finalPath, Buffer.concat([hostBytes, container, trailer]))
    chmodSync(finalPath, 0o755)

    const mb = (statSync(finalPath).size / (1024 * 1024)).toFixed(1)
    console.log(`pulsar: built ${finalPath} (${mb} MB)`)
    console.log(`  run it with ./${fileName}`)
  } finally {
    rmSync(assembly, { recursive: true, force: true })
  }
}

function init() {
  const dir = resolve(args[0] ?? ".")
  mkdirSync(join(dir, "ui"), { recursive: true })
  writeFileSync(join(dir, "main.ts"), MAIN_TS)
  writeFileSync(join(dir, "ui", "main.qml"), MAIN_QML)
  writeFileSync(join(dir, "pulsar.json"), MAIN_JSON)
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "my-app",
        private: true,
        type: "module",
        dependencies: { pulsar: "latest" },
      },
      null,
      2,
    ) + "\n",
  )
  console.log(`pulsar: initialized ${dir}`)
}

function usage() {
  console.log(
    "pulsar <command>\n\n  init [dir]   scaffold a new app\n  run          run the app in the current directory\n  build        build a distributable bundle",
  )
}

switch (cmd) {
  case "run":
    run()
    break
  case "init":
    init()
    break
  case "build":
    await build()
    break
  default:
    usage()
    process.exit(cmd ? 1 : 0)
}
