import type { BuildOutput } from "bun"
import { createHash } from "crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from "fs"
import { tmpdir } from "os"
import { basename, dirname, join } from "path"
import { spawnSync } from "child_process"
import type { AppManifest } from "../core/sdk/manifest.ts"
import { manifestCompat, manifestTargets } from "../core/sdk/manifest.ts"
import {
  ANDROID_ABI,
  ANDROID_QT_VERSION,
  SKIP,
  androidPackageName,
  appFiles,
  buildAndroid,
  bundleRuntime,
  devManifest,
  findAndroidTools,
} from "./android.ts"
import { readManifest, resolveEntry } from "./app.ts"
import { createIgnoreFilter } from "./ignore.ts"
import { compileAppShaders } from "./shaders.ts"
import { mapErrorText, parseInlineSourceMap, type SourceMapper } from "./sourcemap.ts"
import { pulsarRoot } from "./core.ts"
import { ui } from "./ui.ts"

const COMMAND_REPLY_MS = 5000
const PERF_REPLY_MS = 100_000

export interface DevAndroidOptions {
  appDir: string
  device?: string
  port?: number
  install?: boolean
  forceInstall?: boolean
  keepAwake?: boolean
}

interface DevFile {
  path: string
  data: string
}

interface DevPayload {
  version: string
  files: DevFile[]
}

interface DeviceLog {
  type: "log"
  level: string
  message: string
  source: string
}

const PACKAGE_ACTIVITY = "com.pulsar.host.PulsarActivity"

const adbPath = (): string => process.env.ADB ?? "adb"

const adbDevices = (): string[] => {
  const result = spawnSync(adbPath(), ["devices"], { encoding: "utf8" })

  if (result.status !== 0) throw new Error("adb devices failed (is adb installed?)")

  return result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith("\tdevice"))
    .map((line) => line.split(/\s+/)[0]!)
}

const pickDevice = (wanted?: string): string => {
  const devices = adbDevices()

  if (wanted) {
    if (!devices.includes(wanted)) throw new Error(`device not found: ${wanted}`)

    return wanted
  }

  if (devices.length === 1) return devices[0]!

  if (devices.length === 0) throw new Error("no Android device connected")

  throw new Error(`several devices connected (${devices.join(", ")}); pass --device <serial>`)
}

const hashTree = (hash: ReturnType<typeof createHash>, dir: string, prefix: string): void => {
  if (!existsSync(dir)) return

  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue

    const path = join(dir, entry.name)
    const rel = `${prefix}/${entry.name}`

    if (entry.isDirectory()) {
      hashTree(hash, path, rel)
      continue
    }

    if (!entry.isFile()) continue

    hash.update(rel)
    hash.update(readFileSync(path))
  }
}

const nativeFingerprint = (manifest: AppManifest | null, packageName: string): string => {
  const root = pulsarRoot()
  const hash = createHash("sha256")

  hashTree(hash, join(root, "host"), "host")
  hashTree(hash, join(root, "android"), "android")
  hash.update(readFileSync(join(root, "CMakeLists.txt")))
  hash.update(
    JSON.stringify({
      packageName,
      name: manifest?.name,
      version: manifest?.version,
      abi: ANDROID_ABI,
      qt: ANDROID_QT_VERSION,
    }),
  )

  return hash.digest("hex")
}

const printBuildErrors = (e: unknown) => {
  const errors = e instanceof AggregateError ? e.errors : [e]

  for (const error of errors) console.error(error instanceof Error ? error.message : String(error))
}

const awaitBundle = async (result: Promise<BuildOutput>) => {
  let bundle: BuildOutput

  try {
    bundle = await result
  } catch (e) {
    printBuildErrors(e)
    throw new Error("failed to bundle the portable runtime")
  }

  if (!bundle.success) {
    for (const log of bundle.logs) console.error(log.message)

    throw new Error("failed to bundle the portable runtime")
  }

  return bundle
}

const buildPayload = async (appDir: string, entry: string, manifest: AppManifest | null): Promise<DevPayload> => {
  const assembly = mkdtempSync(join(tmpdir(), "pulsar-dev-"))

  try {
    const { result } = bundleRuntime(entry, assembly, true)

    const bundle = await awaitBundle(result)

    const runtime = await bundle.outputs[0]!.text()
    const entries = appFiles(appDir, manifest).map((path) => ({ path, data: readFileSync(join(appDir, path)) }))
    const devJson = Buffer.from(`${JSON.stringify(devManifest(manifest), null, 2)}\n`)
    const manifestIndex = entries.findIndex((item) => item.path === "pulsar.json")

    if (manifestIndex >= 0) entries[manifestIndex] = { path: "pulsar.json", data: devJson }
    else entries.push({ path: "pulsar.json", data: devJson })

    entries.push({ path: "runtime.js", data: Buffer.from(runtime) })
    entries.sort((a, b) => a.path.localeCompare(b.path))

    const hash = createHash("sha256")

    for (const item of entries) {
      hash.update(item.path)
      hash.update(item.data)
    }

    return {
      version: hash.digest("hex"),
      files: entries.map((item) => ({ path: item.path, data: item.data.toString("base64") })),
    }
  } finally {
    rmSync(assembly, { recursive: true, force: true })
  }
}

const printLog = (log: DeviceLog, mapper: SourceMapper | null): string => {
  const prefix = log.source ? `[${log.source}/${log.level}]` : `[${log.level}]`
  const message = log.level === "error" ? mapErrorText(log.message, mapper) : log.message

  console.log(`  ${prefix} ${message}`)

  return message
}

const mapperForPayload = (payload: DevPayload, appDir: string): SourceMapper | null => {
  const runtime = payload.files.find((file) => file.path === "runtime.js")

  if (!runtime) return null

  return parseInlineSourceMap(Buffer.from(runtime.data, "base64").toString("utf8"), {
    baseDir: appDir,
    root: pulsarRoot(),
  })
}

export const devAndroid = async (options: DevAndroidOptions): Promise<void> => {
  const appDir = options.appDir
  const manifest = readManifest(appDir)
  const ignore = createIgnoreFilter(appDir, manifest)

  compileAppShaders(appDir, manifest ?? undefined)

  if (!manifestTargets(manifest).includes("android"))
    throw new Error(`android is not listed in targets (${manifestTargets(manifest).join(", ")})`)

  if (manifestCompat(manifest) !== "portable") throw new Error('android requires compat: "portable"')

  const entry = resolveEntry(appDir, manifest, "android")
  const name = manifest?.name ?? basename(appDir)
  const packageName = androidPackageName(manifest, true)
  const device = pickDevice(options.device)
  const adb = adbPath()

  let tools: ReturnType<typeof findAndroidTools>

  try {
    tools = findAndroidTools()
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}; run \`pulsar install --android\` first`)
  }

  const buildDir = join(appDir, "build", `android-${ANDROID_ABI}-dev`)
  const fingerprintPath = join(buildDir, "fingerprint.json")
  const apk = join(appDir, "dist", `${name}-dev.apk`)

  const installed = (): boolean => {
    const result = spawnSync(adb, ["-s", device, "shell", "pm", "path", packageName], { encoding: "utf8" })

    return result.stdout.includes("package:")
  }

  const fingerprint = nativeFingerprint(manifest, packageName)
  const previous = existsSync(fingerprintPath)
    ? (JSON.parse(readFileSync(fingerprintPath, "utf8")) as { fingerprint?: string }).fingerprint
    : undefined
  const needsBuild =
    options.install !== false && (options.forceInstall || !existsSync(apk) || previous !== fingerprint || !installed())

  if (needsBuild) {
    ui.step(`dev APK is stale (${previous ? "native inputs changed" : "first build"})`)

    await buildAndroid({ appDir, manifest, entry, outDir: join(appDir, "dist"), dev: true })

    const install = spawnSync(adb, ["-s", device, "install", "-r", apk], { stdio: "inherit" })

    if (install.status !== 0)
      throw new Error(`adb install failed; if the signature differs run \`adb uninstall ${packageName}\``)

    mkdirSync(buildDir, { recursive: true })
    writeFileSync(fingerprintPath, `${JSON.stringify({ fingerprint }, null, 2)}\n`)
  }

  let payload = await buildPayload(appDir, entry, manifest)
  let mapper = mapperForPayload(payload, appDir)

  const commands: Record<string, unknown>[] = []
  const replies = new Map<number, { resolve: (value: unknown) => void; timer: ReturnType<typeof setTimeout> }>()

  let pollResolve: ((response: Response) => void) | undefined
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let connected = false
  let commandID = 0

  const json = (body: unknown): Response => Response.json(body, { headers: { "cache-control": "no-store" } })

  const finishPoll = (batch: unknown[]): void => {
    if (!pollResolve) return

    const resolve = pollResolve

    pollResolve = undefined

    if (pollTimer) clearTimeout(pollTimer)

    pollTimer = undefined
    resolve(json({ commands: batch }))
  }

  const control = (body: Record<string, unknown>): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const request = ++commandID
      const command = { kind: "cmd", request, ts: Date.now(), ...body }
      const timer = setTimeout(() => {
        replies.delete(request)

        const index = commands.indexOf(command)

        if (index >= 0) commands.splice(index, 1)

        reject(new Error("device did not reply"))
      }, body.cmd === "perf" ? PERF_REPLY_MS : COMMAND_REPLY_MS)

      replies.set(request, { resolve, timer })
      commands.push(command)

      if (pollResolve) finishPoll(commands.splice(0))
    })
  }

  const receiveLog = async (request: Request) => {
    try {
      const log = (await request.json()) as DeviceLog
      const message = printLog(log, mapper)

      if (log.level === "error") void control({ cmd: "show-error", text: message }).catch(() => {})
    } catch {
      // A malformed log line from the device is skipped.
    }
  }

  const receiveReply = async (request: Request) => {
    try {
      const reply = (await request.json()) as { id?: number }
      const pending = typeof reply.id === "number" ? replies.get(reply.id) : undefined

      if (!pending) return

      clearTimeout(pending.timer)
      replies.delete(reply.id!)
      pending.resolve(reply)
    } catch {
      // A malformed reply from the device is skipped.
    }
  }

  let port = options.port ?? 0

  const launch = (): void => {
    spawnSync(adb, ["-s", device, "shell", "am", "force-stop", packageName], { stdio: "ignore" })
    spawnSync(
      adb,
      [
        "-s",
        device,
        "shell",
        "am",
        "start",
        "-n",
        `${packageName}/${PACKAGE_ACTIVITY}`,
        "--es",
        "pulsar-dev-url",
        `http://127.0.0.1:${port}/`,
      ],
      { stdio: "ignore" },
    )
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    idleTimeout: 120,
    async fetch(request) {
      const url = new URL(request.url)

      if (url.pathname === "/__dev/payload.json") return json(payload)

      if (url.pathname === "/__dev/hello") {
        if (!connected) ui.step("device connected")

        connected = true

        return json({ ok: true })
      }

      if (url.pathname === "/__dev/log") {
        await receiveLog(request)

        return json({ ok: true })
      }

      if (url.pathname === "/__dev/reload") {
        launch()

        return json({ ok: true })
      }

      if (url.pathname === "/__dev/reply") {
        await receiveReply(request)

        return json({ ok: true })
      }

      if (url.pathname === "/__ctl") {
        try {
          return json(await control((await request.json()) as Record<string, unknown>))
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) })
        }
      }

      if (url.pathname === "/__dev/events") {
        if (commands.length > 0) return json({ commands: commands.splice(0) })

        if (pollResolve) finishPoll([])

        return new Promise<Response>((resolve) => {
          pollResolve = resolve
          pollTimer = setTimeout(() => {
            pollResolve = undefined
            pollTimer = undefined
            resolve(json({ commands: [] }))
          }, 20000)
        })
      }

      return new Response(`pulsar dev (${name})\n`, { headers: { "content-type": "text/plain" } })
    },
  })

  port = server.port ?? port

  const sessionPath = join(appDir, ".pulsar", "dev.json")

  mkdirSync(dirname(sessionPath), { recursive: true })
  writeFileSync(sessionPath, `${JSON.stringify({ port, package: packageName, device, name }, null, 2)}\n`)

  const reverse = spawnSync(adb, ["-s", device, "reverse", `tcp:${port}`, `tcp:${port}`], { stdio: "ignore" })

  if (reverse.status !== 0) {
    void server.stop(true)
    rmSync(sessionPath, { force: true })
    throw new Error("adb reverse failed; reconnect the device and retry")
  }

  const keepAwake = options.keepAwake !== false
  const previousStayOn = keepAwake
    ? spawnSync(adb, ["-s", device, "shell", "settings", "get", "global", "stay_on_while_plugged_in"], {
        encoding: "utf8",
      }).stdout.trim()
    : ""

  if (keepAwake) {
    spawnSync(adb, ["-s", device, "shell", "svc", "power", "stayon", "true"], { stdio: "ignore" })
    spawnSync(adb, ["-s", device, "shell", "input", "keyevent", "KEYCODE_WAKEUP"], { stdio: "ignore" })
    spawnSync(adb, ["-s", device, "shell", "wm", "dismiss-keyguard"], { stdio: "ignore" })
  }

  let watcher: ReturnType<typeof watch> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let rebuilding = false
  let pending = false

  const schedule = () => {
    if (timer) clearTimeout(timer)

    timer = setTimeout(() => void reload(), 150)
  }

  const reload = async (): Promise<void> => {
    if (rebuilding) {
      pending = true

      return
    }

    rebuilding = true

    try {
      const next = await buildPayload(appDir, entry, manifest)

      if (next.version === payload.version) {
        rebuilding = false

        return
      }

      payload = next
      mapper = mapperForPayload(next, appDir)

      ui.step(`bundle ${next.version.slice(0, 8)}; reloading ${packageName}`)

      try {
        await control({ cmd: "reload" })
      } catch (e) {
        ui.step(`in-process reload failed (${e instanceof Error ? e.message : String(e)}); restarting`)
        launch()
      }
    } catch (e) {
      ui.error(`rebuild failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      rebuilding = false

      if (pending) {
        pending = false
        schedule()
      }
    }
  }

  const skipped = (path: string): boolean => {
    return ignore.ignored(path)
  }

  try {
    watcher = watch(appDir, { recursive: true }, (_event, filename) => {
      if (filename && !skipped(String(filename))) schedule()
    })
  } catch (e) {
    ui.warn(`cannot watch ${appDir}: ${e instanceof Error ? e.message : String(e)}`)
  }

  let stopping = false

  const stop = (): void => {
    if (stopping) return

    stopping = true

    if (timer) clearTimeout(timer)

    finishPoll([])
    watcher?.close()
    void server.stop(true)

    for (const [id, pending] of replies) {
      clearTimeout(pending.timer)
      replies.delete(id)
      pending.resolve({ ok: false, error: "dev stopped" })
    }
    rmSync(sessionPath, { force: true })
    spawnSync(adb, ["-s", device, "reverse", "--remove", `tcp:${port}`], { stdio: "ignore" })

    if (keepAwake)
      spawnSync(
        adb,
        ["-s", device, "shell", "settings", "put", "global", "stay_on_while_plugged_in", previousStayOn || "0"],
        { stdio: "ignore" },
      )

    ui.step("dev stopped")
    process.exit(0)
  }

  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)

  ui.step(`dev ${name} on ${device}`)
  console.log(`  package: ${packageName}`)
  console.log(`  server:  http://127.0.0.1:${port}/`)
  console.log(`  app:     ${apk}`)
  console.log(`  qt:      ${tools.qt}`)

  launch()
}
