import type { BunPlugin } from "bun"
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "fs"
import { homedir } from "os"
import { basename, dirname, join, resolve } from "path"
import type { AppManifest } from "../core/sdk/manifest.ts"
import { cliVersion, platformId, pulsarHome, pulsarRoot, releaseUrl } from "./core.ts"
import { createIgnoreFilter } from "./ignore.ts"

export const ANDROID_QT_VERSION = "6.9.3"
export const ANDROID_ABI = "arm64-v8a"
export const ANDROID_NDK_VERSION = "27.2.12479018"
export const ANDROID_PLATFORM = "android-35"
export const ANDROID_BUILD_TOOLS = "35.0.0"
export const ANDROID_MIN_SDK = 28

const NODE_BUILTIN =
  /^(node:|bun:|fs(\/promises)?$|path$|os$|child_process$|worker_threads$|net$|tls$|http$|https$|crypto$|stream$|buffer$|util$|assert$|url$|zlib$|events$|dns$|dgram$|cluster$|vm$|module$|readline$|repl$|tty$|v8$|perf_hooks$|async_hooks$|inspector$|trace_events$|.*\.node$)/

export const SKIP = new Set(["node_modules", ".git", "dist", "build", ".cache", ".pulsar"])

export interface AndroidTools {
  qt: string
  hostQt: string
  sdk: string
  ndk: string
  javaHome: string
}

const firstExisting = (candidates: string[]): string | undefined => {
  for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate

  return undefined
}

const hostQtFor = (qt: string): string => {
  const conf = readFileSync(join(qt, "bin", "target_qt.conf"), "utf8")
  const line = conf.split("\n").find((entry) => entry.startsWith("HostPrefix="))

  if (line) {
    const host = resolve(join(qt, "bin"), line.slice("HostPrefix=".length).trim())

    if (existsSync(host)) return host
  }

  const sibling = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "msvc2022_64" : "gcc_64"
  const fallback = join(dirname(qt), sibling)

  if (existsSync(fallback)) return fallback

  throw new Error(`host Qt for Android not found next to ${qt}`)
}

export const androidBase = (): string => join(pulsarHome(), "android")

export const installedQt = (abi = ANDROID_ABI): string =>
  join(androidBase(), "qt", ANDROID_QT_VERSION, `android_${abi.replace(/-/g, "_")}`)

export const installedJdk = (): string => join(androidBase(), "jdk", "17")

export const installedSdk = (): string => join(androidBase(), "sdk")

const CMDLINE_TOOLS: Record<string, string> = {
  linux: "commandlinetools-linux-11076708_latest.zip",
  darwin: "commandlinetools-mac-11076708_latest.zip",
  win32: "commandlinetools-win-11076708_latest.zip",
}

const adoptiumOs = (): string =>
  process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux"

const adoptiumArch = (): string => (process.arch === "arm64" ? "aarch64" : "x64")

const download = async (url: string, dest: string): Promise<void> => {
  const res = await fetch(url)

  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)

  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

const extract = (archive: string, dest: string): void => {
  mkdirSync(dest, { recursive: true })

  const zip = archive.endsWith(".zip")
  const command =
    zip && process.platform !== "win32"
      ? ["unzip", "-q", "-o", archive, "-d", dest]
      : ["tar", "-xf", archive, "-C", dest]

  const result = spawnSync(command[0]!, command.slice(1), { stdio: "inherit" })

  if (result.status !== 0) throw new Error(`failed to extract ${basename(archive)}`)
}

/** Locate the Android Qt install, SDK, NDK and JDK. */
export const findAndroidTools = (): AndroidTools => {
  const home = homedir()
  const qt =
    firstExisting([
      process.env.PULSAR_ANDROID_QT ?? "",
      installedQt(),
      join(home, "Qt", ANDROID_QT_VERSION, "android_arm64_v8a"),
    ]) ?? ""
  const sdk =
    firstExisting([
      process.env.PULSAR_ANDROID_SDK ?? "",
      process.env.ANDROID_SDK_ROOT ?? "",
      process.env.ANDROID_HOME ?? "",
      installedSdk(),
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
      installedJdk(),
      "/usr/lib/jvm/java-17-openjdk",
      "/usr/lib/jvm/java-17-openjdk-amd64",
    ]) ?? ""

  const missing: string[] = []

  if (!qt || !existsSync(join(qt, "bin", "qt-cmake"))) missing.push("Qt for Android (PULSAR_ANDROID_QT)")
  if (!sdk) missing.push("Android SDK (PULSAR_ANDROID_SDK)")
  if (!ndk) missing.push(`Android NDK ${ANDROID_NDK_VERSION} (PULSAR_ANDROID_NDK)`)
  if (!javaHome) missing.push("JDK 17 (PULSAR_JAVA_HOME)")

  if (missing.length > 0) throw new Error(`missing Android toolchain: ${missing.join(", ")}`)

  return { qt, hostQt: hostQtFor(qt), sdk, ndk, javaHome }
}

/**
 * Download everything `pulsar build --target android` needs into PULSAR_HOME:
 * JDK 17, the Android SDK/NDK, and the Qt for Android bundle published with
 * each Pulsar release. Existing installations are reused.
 */
export const installAndroid = async (version?: string): Promise<AndroidTools> => {
  const tag = !version || version === "latest" ? "latest" : `v${version}`
  const base = androidBase()
  const platform = platformId()

  mkdirSync(base, { recursive: true })

  const javaHome = installedJdk()

  if (!existsSync(join(javaHome, "bin", "java"))) {
    console.log("pulsar: installing JDK 17")

    const archive = join(base, `jdk-17-${platform}.tar.gz`)

    await download(
      `https://api.adoptium.net/v3/binary/latest/17/ga/${adoptiumOs()}/${adoptiumArch()}/jdk/hotspot/normal/eclipse`,
      archive,
    )

    const staging = join(base, ".jdk")

    rmSync(staging, { recursive: true, force: true })
    extract(archive, staging)
    rmSync(archive, { force: true })

    const unpacked = readdirSync(staging).find((entry) => entry.startsWith("jdk-"))

    if (!unpacked) throw new Error("JDK archive has no jdk-* directory")

    rmSync(javaHome, { recursive: true, force: true })
    mkdirSync(join(base, "jdk"), { recursive: true })
    renameSync(join(staging, unpacked), javaHome)
    rmSync(staging, { recursive: true, force: true })
  }

  const sdk = installedSdk()
  const sdkmanager = join(sdk, "cmdline-tools", "latest", "bin", "sdkmanager")

  if (!existsSync(sdkmanager)) {
    console.log("pulsar: installing Android command-line tools")

    const archive = join(base, "cmdline-tools.zip")

    await download(
      `https://dl.google.com/android/repository/${CMDLINE_TOOLS[process.platform] ?? CMDLINE_TOOLS.linux}`,
      archive,
    )

    const staging = join(base, ".cmdline-tools")

    rmSync(staging, { recursive: true, force: true })
    extract(archive, staging)
    rmSync(archive, { force: true })
    rmSync(join(sdk, "cmdline-tools", "latest"), { recursive: true, force: true })
    mkdirSync(join(sdk, "cmdline-tools"), { recursive: true })
    renameSync(join(staging, "cmdline-tools"), join(sdk, "cmdline-tools", "latest"))
    rmSync(staging, { recursive: true, force: true })
  }

  const env = { ...process.env, JAVA_HOME: javaHome }

  console.log("pulsar: accepting Android SDK licenses")
  spawnSync(sdkmanager, ["--licenses"], { input: "y\n".repeat(64), stdio: ["pipe", "inherit", "inherit"], env })

  const packages = [
    "platform-tools",
    `platforms;${ANDROID_PLATFORM}`,
    `build-tools;${ANDROID_BUILD_TOOLS}`,
    `ndk;${ANDROID_NDK_VERSION}`,
  ]

  console.log(`pulsar: installing ${packages.join(", ")}`)

  const install = spawnSync(sdkmanager, packages, { stdio: "inherit", env })

  if (install.status !== 0) throw new Error("sdkmanager failed")

  const qt = installedQt()

  if (!existsSync(join(qt, "bin", "qt-cmake"))) {
    console.log(`pulsar: installing Qt ${ANDROID_QT_VERSION} for Android`)

    const asset = `pulsar-android-qt-${ANDROID_QT_VERSION}-${platform}.tar.gz`
    const archive = join(base, asset)

    await download(releaseUrl(tag, asset), archive)

    rmSync(join(base, "qt"), { recursive: true, force: true })
    extract(archive, join(base, "qt"))
    rmSync(archive, { force: true })
  }

  return findAndroidTools()
}

const versionCode = (version: string | undefined): number => {
  const parts = (version ?? "0.1.0").split(".").map((part) => Number.parseInt(part, 10) || 0)

  return (parts[0] ?? 0) * 10000 + (parts[1] ?? 0) * 100 + (parts[2] ?? 0)
}

/** Android package id; dev builds live next to production with a `.dev` suffix. */
export const androidPackageName = (manifest: AppManifest | null, dev = false): string => {
  const id = manifest?.id ?? "com.pulsar.app"

  return dev ? `${id}.dev` : id
}

/** The manifest as seen by a dev build: a separate app id keeps its data apart. */
export const devManifest = (manifest: AppManifest | null): AppManifest => {
  return { ...(manifest ?? {}), id: androidPackageName(manifest, true) }
}

export const appFiles = (appDir: string, manifest: AppManifest | null = null): string[] => {
  const files: string[] = []
  const ignore = createIgnoreFilter(appDir, manifest)

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

      if (entry.isFile()) files.push(relPath)
    }
  }

  walk(appDir, "")

  return files
}

const escapeXml = (value: string): string => {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

const writeQrc = (
  path: string,
  files: string[],
  appDir: string,
  extra: { alias: string; path: string }[] = [],
  overrides: Record<string, string> = {},
): string => {
  const lines = ["<RCC>", '  <qresource prefix="/app">']

  for (const file of files) {
    lines.push(`    <file alias="${escapeXml(file)}">${escapeXml(overrides[file] ?? join(appDir, file))}</file>`)
  }

  for (const item of extra) {
    lines.push(`    <file alias="${escapeXml(item.alias)}">${escapeXml(item.path)}</file>`)
  }

  lines.push("  </qresource>", "</RCC>", "")
  writeFileSync(path, lines.join("\n"))

  return path
}

const hashFiles = (files: string[], appDir: string, extra: string): string => {
  const hash = createHash("sha256")

  for (const file of files.sort()) {
    hash.update(file)
    hash.update(readFileSync(join(appDir, file)))
  }

  hash.update(extra)

  return hash.digest("hex")
}

export const bundleRuntime = (entry: string, assembly: string, sourcemap = false) => {
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
      `const restored = JSON.parse(__pulsarRestore ?? "null");`,
      `const runtime = createRuntime({`,
      `  transport: createEmbeddedTransport(),`,
      `  platform: createQuickJsPlatform(),`,
      `  manifest,`,
      `  info: { name: "quickjs", version: ${JSON.stringify(ANDROID_QT_VERSION)} },`,
      `});`,
      `runtime.start();`,
      `void (async () => {`,
      `  await import(${spec(entry)});`,
      `  if (restored) runtime.restore(restored);`,
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
    sourcemap: sourcemap ? "inline" : "none",
    plugins: [plugin],
  } as unknown as Parameters<typeof Bun.build>[0]

  const result = Bun.build(config)

  return { entry: runtimeEntry, result }
}

const hostTool = (hostQt: string, dir: string, name: string): string =>
  join(hostQt, dir, process.platform === "win32" ? `${name}.exe` : name)

const patchDeploymentTools = (settingsPath: string, hostQt: string): void => {
  if (!existsSync(settingsPath)) return

  const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>

  settings["qml-importscanner-binary"] = hostTool(hostQt, "libexec", "qmlimportscanner")
  settings["rcc-binary"] = hostTool(hostQt, "libexec", "rcc")
  settings["qml-dom-binary"] = hostTool(hostQt, "bin", "qmldom")

  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
}

const signApk = (apk: string, target: string, tools: AndroidTools): void => {
  const keystore = process.env.PULSAR_ANDROID_KEYSTORE ?? join(homedir(), ".android", "debug.keystore")
  const storePass = process.env.PULSAR_ANDROID_KEYSTORE_PASS ?? "android"
  const keyPass = process.env.PULSAR_ANDROID_KEY_PASS ?? storePass
  const alias = process.env.PULSAR_ANDROID_KEY_ALIAS ?? "androiddebugkey"

  if (!existsSync(keystore)) {
    if (process.env.PULSAR_ANDROID_KEYSTORE) throw new Error(`keystore not found: ${keystore}`)

    mkdirSync(dirname(keystore), { recursive: true })

    const keytool = join(tools.javaHome, "bin", process.platform === "win32" ? "keytool.exe" : "keytool")
    const generate = spawnSync(
      keytool,
      [
        "-genkeypair",
        "-keystore",
        keystore,
        "-storepass",
        storePass,
        "-keypass",
        keyPass,
        "-alias",
        alias,
        "-dname",
        "CN=Android Debug,O=Android,C=US",
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-validity",
        "10000",
      ],
      { stdio: "inherit" },
    )

    if (generate.status !== 0) throw new Error("failed to create the debug keystore")
  }

  const signer = join(
    tools.sdk,
    "build-tools",
    ANDROID_BUILD_TOOLS,
    process.platform === "win32" ? "apksigner.bat" : "apksigner",
  )

  rmSync(target, { force: true })

  const sign = spawnSync(
    signer,
    [
      "sign",
      "--ks",
      keystore,
      "--ks-key-alias",
      alias,
      "--ks-pass",
      `pass:${storePass}`,
      "--key-pass",
      `pass:${keyPass}`,
      "--out",
      target,
      apk,
    ],
    { stdio: "inherit" },
  )

  if (sign.status !== 0) throw new Error("failed to sign the apk")
}

export interface AndroidBuildOptions {
  appDir: string
  manifest: AppManifest | null
  entry: string
  outDir: string
  abi?: string
  dev?: boolean
}

/** Bundle the app with the QuickJS runtime, cross-compile the host and package an APK. */
export const buildAndroid = async (options: AndroidBuildOptions): Promise<string> => {
  const { appDir, manifest, entry, outDir } = options
  const abi = options.abi ?? ANDROID_ABI
  const dev = options.dev ?? false

  let tools: AndroidTools

  try {
    tools = findAndroidTools()
  } catch (e) {
    if (process.env.PULSAR_NO_INSTALL === "1") throw e

    console.log(`pulsar: ${e instanceof Error ? e.message : String(e)}`)
    console.log("pulsar: installing the Android toolchain (one time, ~2 GB)")

    tools = await installAndroid(cliVersion())
  }

  const name = manifest?.name ?? basename(appDir)
  const packageName = androidPackageName(manifest, dev)
  const appLabel = dev ? `${name} (dev)` : name
  const versionName = manifest?.version ?? "0.1.0"

  console.log(`pulsar: android ${abi} ${dev ? "dev " : ""}-> ${name}${dev ? "-dev" : ""}.apk`)
  console.log(`  qt:  ${tools.qt}`)
  console.log(`  host: ${tools.hostQt}`)
  console.log(`  sdk: ${tools.sdk}`)
  console.log(`  ndk: ${tools.ndk}`)

  const buildDir = join(appDir, "build", `android-${abi}${dev ? "-dev" : ""}`)
  const assembly = join(buildDir, "app")

  mkdirSync(assembly, { recursive: true })

  const { result } = bundleRuntime(entry, assembly)

  let bundle: Awaited<typeof result>

  try {
    bundle = await result
  } catch (e) {
    const errors = e instanceof AggregateError ? e.errors : [e]

    for (const error of errors) console.error(error instanceof Error ? error.message : String(error))

    throw new Error("failed to bundle the portable runtime")
  }

  if (!bundle.success) {
    for (const log of bundle.logs) console.error(log.message)

    throw new Error("failed to bundle the portable runtime")
  }

  const bundleText = await bundle.outputs[0]!.text()

  writeFileSync(join(assembly, "runtime.js"), bundleText)

  const overrides: Record<string, string> = {}

  if (dev) {
    const devPath = join(assembly, "pulsar.json")

    writeFileSync(devPath, `${JSON.stringify(devManifest(manifest), null, 2)}\n`)
    overrides["pulsar.json"] = devPath
  }

  const files = appFiles(appDir, manifest)
  const qrc = writeQrc(
    join(assembly, "app.qrc"),
    files,
    appDir,
    [{ alias: "runtime.js", path: join(assembly, "runtime.js") }],
    overrides,
  )
  const buildId = hashFiles(files, appDir, `${bundleText}${dev ? ":dev" : ""}`)

  const env = {
    ...process.env,
    JAVA_HOME: tools.javaHome,
    ANDROID_SDK_ROOT: tools.sdk,
    ANDROID_HOME: tools.sdk,
    ANDROID_NDK_ROOT: tools.ndk,
    QT_HOST_PATH: tools.hostQt,
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
      `-DPULSAR_ANDROID_APP_DIR=${appDir}`,
      `-DPULSAR_ANDROID_PACKAGE_NAME=${packageName}`,
      `-DPULSAR_ANDROID_APP_NAME=${appLabel}`,
      `-DPULSAR_ANDROID_VERSION_NAME=${versionName}`,
      `-DPULSAR_ANDROID_VERSION_CODE=${versionCode(versionName)}`,
      ...(dev ? ["-DPULSAR_ANDROID_DEV=ON"] : []),
      `-DQT_HOST_PATH=${tools.hostQt}`,
    ],
    { stdio: "inherit", env },
  )

  if (configure.status !== 0) throw new Error("android configure failed")

  patchDeploymentTools(join(buildDir, "android-pulsar-android-deployment-settings.json"), tools.hostQt)

  const compile = spawnSync("cmake", ["--build", buildDir, "--target", "pulsar-android_make_apk", "--parallel", "6"], {
    stdio: "inherit",
    env,
  })

  if (compile.status !== 0) throw new Error("android build failed")

  const apk = join(buildDir, "android-build", "pulsar-android.apk")

  if (!existsSync(apk)) throw new Error(`apk not found at ${apk}`)

  mkdirSync(outDir, { recursive: true })

  const finalPath = join(outDir, `${name}${dev ? "-dev" : ""}.apk`)

  signApk(apk, finalPath, tools)

  const mb = (statSync(finalPath).size / (1024 * 1024)).toFixed(1)

  console.log(`pulsar: built ${resolve(finalPath)} (${mb} MB)`)

  return finalPath
}
