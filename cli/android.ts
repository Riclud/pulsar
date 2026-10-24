import type { BunPlugin } from "bun"
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs"
import { homedir } from "os"
import { basename, join, resolve } from "path"
import type { AppManifest } from "../core/sdk/manifest.ts"
import { pulsarHome, pulsarRoot } from "./core.ts"

export const ANDROID_QT_VERSION = "6.9.3"
export const ANDROID_ABI = "arm64-v8a"
export const ANDROID_NDK_VERSION = "27.2.12479018"
export const ANDROID_PLATFORM = "android-35"
export const ANDROID_MIN_SDK = 28

const NODE_BUILTIN =
  /^(node:|bun:|fs(\/promises)?$|path$|os$|child_process$|worker_threads$|net$|tls$|http$|https$|crypto$|stream$|buffer$|util$|assert$|url$|zlib$|events$|dns$|dgram$|cluster$|vm$|module$|readline$|repl$|tty$|v8$|perf_hooks$|async_hooks$|inspector$|trace_events$|.*\.node$)/

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".cache"])

export interface AndroidTools {
  qt: string
  sdk: string
  ndk: string
  javaHome: string
}

const firstExisting = (candidates: string[]): string | undefined => {
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return undefined
}

/** Locate the Android Qt install, SDK, NDK and JDK. */
export function findAndroidTools(): AndroidTools {
  const home = homedir()
  const qt =
    firstExisting([
      process.env.PULSAR_ANDROID_QT ?? "",
      join(pulsarHome(), "android", "qt", ANDROID_QT_VERSION, ANDROID_ABI),
      join(home, "Qt", ANDROID_QT_VERSION, "android_arm64_v8a"),
    ]) ?? ""
  const sdk =
    firstExisting([
      process.env.PULSAR_ANDROID_SDK ?? "",
      process.env.ANDROID_SDK_ROOT ?? "",
      process.env.ANDROID_HOME ?? "",
      join(home, "Android", "Sdk"),
      "/opt/android-sdk",
    ]) ?? ""
  const ndk =
    firstExisting([
      process.env.PULSAR_ANDROID_NDK ?? "",
      process.env.ANDROID_NDK_ROOT ?? "",
      sdk ? join(sdk, "ndk", ANDROID_NDK_VERSION) : "",
    ]) ?? ""
  const javaHome =
    firstExisting([
      process.env.PULSAR_JAVA_HOME ?? "",
      process.env.JAVA_HOME ?? "",
      "/usr/lib/jvm/java-17-openjdk",
      "/usr/lib/jvm/java-17-openjdk-amd64",
    ]) ?? ""

  const missing: string[] = []
  if (!qt || !existsSync(join(qt, "bin", "qt-cmake"))) missing.push("Qt for Android (PULSAR_ANDROID_QT)")
  if (!sdk) missing.push("Android SDK (PULSAR_ANDROID_SDK)")
  if (!ndk) missing.push(`Android NDK ${ANDROID_NDK_VERSION} (PULSAR_ANDROID_NDK)`)
  if (!javaHome) missing.push("JDK 17 (PULSAR_JAVA_HOME)")

  if (missing.length > 0) throw new Error(`missing Android toolchain: ${missing.join(", ")}`)

  return { qt, sdk, ndk, javaHome }
}

function versionCode(version: string | undefined): number {
  const parts = (version ?? "0.1.0").split(".").map((part) => Number.parseInt(part, 10) || 0)
  return (parts[0] ?? 0) * 10000 + (parts[1] ?? 0) * 100 + (parts[2] ?? 0)
}

function appFiles(appDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue
      const abs = join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(abs, relPath)
      else if (entry.isFile()) files.push(relPath)
    }
  }
  walk(appDir, "")
  return files
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function writeQrc(path: string, files: string[], appDir: string): string {
  const lines = ["<RCC>", '  <qresource prefix="/app">']
  for (const file of files) {
    lines.push(`    <file alias="${escapeXml(file)}">${escapeXml(join(appDir, file))}</file>`)
  }
  lines.push("  </qresource>", "</RCC>", "")
  writeFileSync(path, lines.join("\n"))
  return path
}

function hashFiles(files: string[], appDir: string, extra: string): string {
  const hash = createHash("sha256")
  for (const file of files.sort()) {
    hash.update(file)
    hash.update(readFileSync(join(appDir, file)))
  }
  hash.update(extra)
  return hash.digest("hex")
}

function bundleRuntime(entry: string, assembly: string) {
  const root = pulsarRoot()
  const runtimeEntry = join(assembly, "entry.ts")
  const spec = (p: string) => JSON.stringify(p.replace(/\\/g, "/"))
  writeFileSync(
    runtimeEntry,
    [
      `import { createRuntime } from ${spec(join(root, "core", "runtime", "core.ts"))};`,
      `import { createEmbeddedTransport } from ${spec(join(root, "core", "runtime", "quickjs_transport.ts"))};`,
      `import { createQuickJsPlatform } from ${spec(join(root, "core", "platform", "quickjs.ts"))};`,
      ``,
      `const manifest = JSON.parse(__pulsarManifest ?? "null");`,
      `const runtime = createRuntime({`,
      `  transport: createEmbeddedTransport(),`,
      `  platform: createQuickJsPlatform(),`,
      `  manifest,`,
      `  info: { name: "quickjs", version: ${JSON.stringify(ANDROID_QT_VERSION)} },`,
      `});`,
      `runtime.start();`,
      `void (async () => {`,
      `  await import(${spec(entry)});`,
      `  runtime.wireApp();`,
      `})();`,
      ``,
    ].join("\n"),
  )

  const plugin: BunPlugin = {
    name: "pulsar-android",
    setup(builder) {
      builder.onResolve({ filter: /^pulsar$/ }, () => ({
        path: join(root, "core", "sdk", "index.ts"),
      }))
      builder.onResolve({ filter: NODE_BUILTIN }, (args) => ({ path: args.path, external: true }))
    },
  }

  const config = {
    entrypoints: [runtimeEntry],
    target: "browser",
    format: "iife",
    write: false,
    plugins: [plugin],
  } as unknown as Parameters<typeof Bun.build>[0]

  const result = Bun.build(config)
  return { entry: runtimeEntry, result }
}

export interface AndroidBuildOptions {
  appDir: string
  manifest: AppManifest | null
  entry: string
  outDir: string
  abi?: string
}

/** Bundle the app with the QuickJS runtime, cross-compile the host and package an APK. */
export async function buildAndroid(options: AndroidBuildOptions): Promise<string> {
  const { appDir, manifest, entry, outDir } = options
  const abi = options.abi ?? ANDROID_ABI
  const tools = findAndroidTools()
  const name = manifest?.name ?? basename(appDir)
  const packageName = manifest?.id ?? "com.pulsar.app"
  const versionName = manifest?.version ?? "0.1.0"

  console.log(`pulsar: android ${abi} -> ${name}.apk`)
  console.log(`  qt:  ${tools.qt}`)
  console.log(`  sdk: ${tools.sdk}`)
  console.log(`  ndk: ${tools.ndk}`)

  const buildDir = join(appDir, "build", `android-${abi}`)
  const assembly = join(buildDir, "app")
  mkdirSync(assembly, { recursive: true })

  const { result } = bundleRuntime(entry, assembly)
  const bundle = await result
  if (!bundle.success) {
    for (const log of bundle.logs) console.error(log.message)
    throw new Error("failed to bundle the portable runtime")
  }

  writeFileSync(join(assembly, "runtime.js"), await bundle.outputs[0]!.text())

  const files = appFiles(appDir)
  const qrc = writeQrc(join(assembly, "app.qrc"), files, appDir)
  const buildId = hashFiles(files, appDir, await bundle.outputs[0]!.text())

  const env = {
    ...process.env,
    JAVA_HOME: tools.javaHome,
    ANDROID_SDK_ROOT: tools.sdk,
    ANDROID_HOME: tools.sdk,
    ANDROID_NDK_ROOT: tools.ndk,
    PATH: `${join(tools.sdk, "platform-tools")}:${join(tools.javaHome, "bin")}:${process.env.PATH ?? ""}`,
  }

  const qtCmake = join(tools.qt, "bin", "qt-cmake")
  const configure = spawnSync(
    qtCmake,
    [
      "-S",
      pulsarRoot(),
      "-B",
      buildDir,
      "-G",
      "Ninja",
      `-DANDROID_ABI=${abi}`,
      `-DANDROID_PLATFORM=${ANDROID_PLATFORM}`,
      "-DCMAKE_BUILD_TYPE=Release",
      `-DPULSAR_ANDROID_APP_QRC=${qrc}`,
      `-DPULSAR_ANDROID_BUILD_ID=${buildId}`,
      `-DPULSAR_ANDROID_PACKAGE_NAME=${packageName}`,
      `-DPULSAR_ANDROID_APP_NAME=${name}`,
      `-DPULSAR_ANDROID_VERSION_NAME=${versionName}`,
      `-DPULSAR_ANDROID_VERSION_CODE=${versionCode(versionName)}`,
    ],
    { stdio: "inherit", env },
  )
  if (configure.status !== 0) throw new Error("android configure failed")

  const compile = spawnSync("cmake", ["--build", buildDir, "--target", "pulsar-android_make_apk", "--parallel", "6"], {
    stdio: "inherit",
    env,
  })
  if (compile.status !== 0) throw new Error("android build failed")

  const apk = join(buildDir, "android-build", "pulsar-android.apk")
  if (!existsSync(apk)) throw new Error(`apk not found at ${apk}`)

  mkdirSync(outDir, { recursive: true })
  const finalPath = join(outDir, `${name}.apk`)
  copyFileSync(apk, finalPath)

  const mb = (statSync(finalPath).size / (1024 * 1024)).toFixed(1)
  console.log(`pulsar: built ${resolve(finalPath)} (${mb} MB)`)
  return finalPath
}
