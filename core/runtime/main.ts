import { existsSync, watch } from "fs"
import { dirname, join, resolve } from "path"
import { pathToFileURL } from "url"
import { App, setManifest } from "../sdk/index.ts"
import { createBunPlatform } from "../platform/bun.ts"
import { createRuntime } from "./core.ts"
import { loadManifestFromDisk } from "./manifest.ts"
import { createStdioTransport } from "./stdio.ts"
import { MIN_BUN, bunVersionCompatible } from "./version.ts"

const keepAlive = setInterval(() => {}, 1 << 30)
void keepAlive

const bunVersion = Bun.version ?? "0.0.0"

if (!bunVersionCompatible(bunVersion)) {
  console.error(`[pulsar] Bun ${bunVersion} is too old; Pulsar requires Bun >= ${MIN_BUN}`)
  process.exit(1)
}

const transport = createStdioTransport()
const platform = createBunPlatform()
const bundled = process.env.PULSAR_BUNDLED === "1"
const appDir = resolve(process.env.PULSAR_APP ?? "examples/hello")
const manifest = loadManifestFromDisk(appDir)

setManifest(manifest)

const runtime = createRuntime({
  transport,
  platform,
  manifest,
  info: { name: "bun", version: bunVersion },
  onClose: () => process.exit(0),
})

const formatLogArg = (value: unknown): string => {
  if (typeof value === "string") return value
  if (value instanceof Error) return value.stack ?? value.message

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const emitLog = (level: string, args: unknown[]): void => {
  const message = args.map(formatLogArg).join(" ")

  process.stderr.write(`[${level}] ${message}\n`)
  runtime.send({ jsonrpc: "2.0", method: "__log", params: { level, source: "js", message } })
}

console.log = (...args: unknown[]) => emitLog("log", args)
console.info = (...args: unknown[]) => emitLog("info", args)
console.debug = (...args: unknown[]) => emitLog("debug", args)
console.error = (...args: unknown[]) => emitLog("error", args)
console.warn = (...args: unknown[]) => emitLog("warn", args)

const testCrashMs = Number(process.env.PULSAR_TEST_CRASH_MS ?? 0)

if (testCrashMs > 0) setTimeout(() => process.exit(3), testCrashMs)

process.on("uncaughtException", (e) => runtime.reportError("uncaughtException", e))
process.on("unhandledRejection", (e) => runtime.reportError("unhandledRejection", e))

runtime.start()

const testData = process.env.PULSAR_TEST_DATA

if (testData) transport.sendBinary(1, Buffer.from(testData, "utf8"))

export const wireApp = (): void => {
  const app = App.current
  const bigItems = Number(process.env.PULSAR_TEST_BIG_ITEMS ?? 0)

  if (app && bigItems > 0) {
    app.store.set(
      "big",
      Array.from({ length: bigItems }, (_, i) => `item-${i}`),
    )
  }

  runtime.wireApp()
}

const setupReloadWatcher = (): void => {
  if (!process.env.PULSAR_WATCH) return

  const ignored = (name: string | null) =>
    !name || name === "storage.json" || name.startsWith(".") || name.endsWith(".lock") || name.endsWith(".qml")

  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timer) return

    timer = setTimeout(() => {
      timer = null
      console.error(`[pulsar] change detected; reloading`)
      runtime.send({ jsonrpc: "2.0", method: "__reload" })
    }, 150)
  }

  const dirs: Array<{ path: string; recursive: boolean }> = [
    { path: appDir, recursive: false },
    { path: dirname(resolve(appDir, manifest?.main ?? "main.ts")), recursive: true },
    { path: join(appDir, "ui"), recursive: false },
    { path: resolve(import.meta.dir, ".."), recursive: true },
  ]

  for (const d of dirs) {
    try {
      watch(d.path, { recursive: d.recursive }, (_event, filename) => {
        if (!ignored(filename)) schedule()
      })
    } catch {}
  }
}

if (!bundled) {
  const main = manifest?.main ?? "main.ts"
  const entryTs = resolve(appDir, main)
  const entry = existsSync(entryTs) ? entryTs : resolve(appDir, "main.js")

  try {
    await import(pathToFileURL(entry).href)
  } catch (e) {
    runtime.reportError("load " + entry, e)
  }

  console.error(`[pulsar] app loaded: ${appDir}`)
  wireApp()
}

setupReloadWatcher()
