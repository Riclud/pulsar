import type { BuildOutput, BunPlugin } from "bun"
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "fs"
import { homedir } from "os"
import { basename, dirname, join, resolve } from "path"
import type { AppManifest } from "../core/sdk/manifest.ts"
import { wantsVideo } from "./app.ts"
import { cliVersion, platformId, pulsarHome, pulsarRoot, releaseUrl } from "./core.ts"
import { createIgnoreFilter } from "./ignore.ts"
import { ui } from "./ui.ts"

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

export const androidQtComplete = (qt: string, abi = ANDROID_ABI): boolean => {
  return (
    existsSync(join(qt, "bin", "qt-cmake")) &&
    existsSync(join(qt, "qml", "QtMultimedia")) &&
    existsSync(join(qt, "lib", `libQt6Multimedia_${abi}.so`)) &&
    existsSync(join(qt, "plugins", "multimedia"))
  )
}

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

const DOWNLOAD_ATTEMPTS = 4

export interface DownloadOptions {
  fetcher?: (url: string) => Promise<Response>
  retryDelayMS?: number
}

/** Download `url` to `dest`, retrying network errors and 5xx answers (GitHub returns them now and then). */
export const download = async (url: string, dest: string, options: DownloadOptions = {}): Promise<void> => {
  const fetcher = options.fetcher ?? ((target: string) => fetch(target))
  const retryDelayMS = options.retryDelayMS ?? 2000

  let failure = new Error(`download failed for ${url}`)

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((done) => setTimeout(done, retryDelayMS * (attempt - 1)))

    let res: Response

    try {
      res = await fetcher(url)
    } catch (e) {
      failure = new Error(`${e instanceof Error ? e.message : String(e)} for ${url}`)

      continue
    }

    if (res.ok) {
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()))

      return
    }

    failure = new Error(`${res.status} ${res.statusText} for ${url}`)

    if (res.status < 500) throw failure
  }

  throw failure
}

// KDAB/android_openssl, `ssl_3` is the directory for Qt 6.5.0 and newer (OpenSSL 3.1.8).
// Qt's TLS plugin loads libssl_3.so and libcrypto_3.so by name; Qt does not ship them.
export const OPENSSL_COMMIT = "b71f1470962019bd89534a2919f5925f93bc5779"

export const OPENSSL_LIBS = [
  { name: "libcrypto_3.so", sha256: "1e6c12ae0c2dadfe9d178d7f80f0ab248a1877a234066098bf5594e5205e5740" },
  { name: "libssl_3.so", sha256: "01d2bd0baac626efd3309f35f99c4b826dd9b885a7e4d14d5b12b3603d3a407f" },
] as const

export const opensslDir = (): string => join(androidBase(), "openssl", OPENSSL_COMMIT.slice(0, 12), ANDROID_ABI)

export const opensslURL = (name: string): string => {
  return `https://raw.githubusercontent.com/KDAB/android_openssl/${OPENSSL_COMMIT}/ssl_3/${ANDROID_ABI}/${name}`
}

export const fileSHA256 = (file: string): string => {
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

/** Check `file` against `expected`; a mismatching file is deleted so it is never used. */
export const verifyChecksum = (file: string, expected: string): void => {
  const actual = fileSHA256(file)

  if (actual === expected) return

  rmSync(file, { force: true })

  throw new Error(`checksum mismatch for ${basename(file)}: expected ${expected}, got ${actual}; the file was deleted`)
}

export const opensslComplete = (dir = opensslDir()): boolean => {
  return OPENSSL_LIBS.every((lib) => existsSync(join(dir, lib.name)) && fileSHA256(join(dir, lib.name)) === lib.sha256)
}

/** Fetch the OpenSSL libraries Qt's TLS backend needs; verified files are reused. */
export const installOpenssl = async (dir = opensslDir(), options: DownloadOptions = {}): Promise<string> => {
  mkdirSync(dir, { recursive: true })

  for (const lib of OPENSSL_LIBS) {
    const file = join(dir, lib.name)

    if (existsSync(file) && fileSHA256(file) === lib.sha256) continue

    ui.step(`downloading ${lib.name} (OpenSSL for Qt TLS)`)

    await download(opensslURL(lib.name), file, options)
    verifyChecksum(file, lib.sha256)
  }

  return dir
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

  if (!qt || !androidQtComplete(qt)) missing.push("Qt for Android with multimedia (PULSAR_ANDROID_QT)")
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
    ui.step("installing JDK 17")

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
    ui.step("installing Android command-line tools")

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

  ui.step("accepting Android SDK licenses")
  spawnSync(sdkmanager, ["--licenses"], { input: "y\n".repeat(64), stdio: ["pipe", "inherit", "inherit"], env })

  const packages = [
    "platform-tools",
    `platforms;${ANDROID_PLATFORM}`,
    `build-tools;${ANDROID_BUILD_TOOLS}`,
    `ndk;${ANDROID_NDK_VERSION}`,
  ]

  ui.step(`installing ${packages.join(", ")}`)

  const install = spawnSync(sdkmanager, packages, { stdio: "inherit", env })

  if (install.status !== 0) throw new Error("sdkmanager failed")

  const qt = installedQt()

  if (!androidQtComplete(qt)) {
    ui.step(`installing Qt ${ANDROID_QT_VERSION} for Android`)

    const asset = `pulsar-android-qt-${ANDROID_QT_VERSION}-${platform}.tar.gz`
    const archive = join(base, asset)

    await download(releaseUrl(tag, asset), archive)

    rmSync(join(base, "qt"), { recursive: true, force: true })
    extract(archive, join(base, "qt"))
    rmSync(archive, { force: true })
  }

  await installOpenssl()

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

const ANDROID_PERMISSIONS: Record<string, string[]> = {
  camera: ["android.permission.CAMERA"],
  microphone: ["android.permission.RECORD_AUDIO"],
  location: ["android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"],
  notifications: ["android.permission.POST_NOTIFICATIONS"],
  biometric: ["android.permission.USE_BIOMETRIC", "android.permission.USE_FINGERPRINT"],
  storage: [
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_MEDIA_AUDIO",
  ],
}

/** Whether the app asked for the QR scanner, which brings the camera and decoder libraries. */
export const usesScanner = (manifest: AppManifest | null): boolean => {
  return manifest?.permissions?.includes("scanner") === true
}

const SCANNER_DEPENDENCIES = [
  "implementation 'androidx.activity:activity:1.9.3'",
  "implementation 'androidx.camera:camera-camera2:1.4.2'",
  "implementation 'androidx.camera:camera-lifecycle:1.4.2'",
  "implementation 'androidx.camera:camera-view:1.4.2'",
  "implementation 'com.google.zxing:core:3.5.3'",
]

const SCANNER_ACTIVITY =
  '<activity android:name="com.pulsar.host.ScannerActivity" android:exported="false" ' +
  'android:screenOrientation="portrait" android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" />'

/**
 * The Android package sources for this app: Pulsar's own, plus the scanner activity,
 * its Gradle dependencies and its manifest entry when the app asked for "scanner".
 * Returns undefined when the stock sources are enough.
 */
export const preparePackageSources = (buildDir: string, qtDir: string, manifest: AppManifest | null): string | undefined => {
  if (!usesScanner(manifest)) return undefined

  const root = pulsarRoot()
  const target = join(buildDir, "package")

  rmSync(target, { recursive: true, force: true })
  cpSync(join(root, "android"), target, { recursive: true })
  cpSync(join(root, "android-scanner", "src"), join(target, "src"), { recursive: true })

  const gradle = readFileSync(join(qtDir, "src", "android", "templates", "build.gradle"), "utf8")
  const libs = "implementation fileTree(dir: 'libs', include: ['*.jar', '*.aar'])"

  if (!gradle.includes(libs)) throw new Error("unexpected Qt build.gradle template; cannot add the scanner")

  writeFileSync(join(target, "build.gradle"), gradle.replace(libs, [libs, ...SCANNER_DEPENDENCIES].join("\n    ")))

  const manifestPath = join(target, "AndroidManifest.xml")
  const manifestText = readFileSync(manifestPath, "utf8")

  writeFileSync(manifestPath, manifestText.replace("</application>", `    ${SCANNER_ACTIVITY}\n    </application>`))

  return target
}

/** Map logical `osPermissions` from pulsar.json to Android permission names. */
export const androidPermissions = (manifest: AppManifest | null): string[] => {
  const names = new Set<string>()

  if (usesScanner(manifest)) names.add("android.permission.CAMERA")

  for (const name of manifest?.osPermissions ?? []) {
    for (const permission of ANDROID_PERMISSIONS[name] ?? [name]) names.add(permission)
  }

  return [...names]
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

export const writeQrc = (
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

export const hashFiles = (files: string[], appDir: string, extra: string): string => {
  const hash = createHash("sha256")

  for (const file of files.sort()) {
    hash.update(file)
    hash.update(readFileSync(join(appDir, file)))
  }

  hash.update(extra)

  return hash.digest("hex")
}

export const bundleRuntime = (
  entry: string,
  assembly: string,
  sourcemap = false,
): { entry: string; result: Promise<BuildOutput> } => {
  const root = pulsarRoot()
  const runtimeEntry = join(assembly, "entry.ts")
  const spec = (p: string) => JSON.stringify(p.replace(/\\/g, "/"))

  writeFileSync(
    runtimeEntry,
    [
      `globalThis.__PULSAR_SDK_VERSION = ${JSON.stringify(cliVersion())};`,
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
      builder.onResolve({ filter: /^(pulsar|react)\/jsx-(dev-)?runtime$/ }, (args) => ({
        path: join(root, "core", "sdk", `${args.path.slice(args.path.indexOf("/") + 1)}.ts`),
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

const signAab = (aab: string, target: string, tools: AndroidTools): void => {
  const keystore = process.env.PULSAR_ANDROID_KEYSTORE ?? join(homedir(), ".android", "debug.keystore")
  const storePass = process.env.PULSAR_ANDROID_KEYSTORE_PASS ?? "android"
  const keyPass = process.env.PULSAR_ANDROID_KEY_PASS ?? storePass
  const alias = process.env.PULSAR_ANDROID_KEY_ALIAS ?? "androiddebugkey"
  const signer = join(tools.javaHome, "bin", process.platform === "win32" ? "jarsigner.exe" : "jarsigner")

  rmSync(target, { force: true })

  const sign = spawnSync(
    signer,
    ["-keystore", keystore, "-storepass", storePass, "-keypass", keyPass, "-signedjar", target, aab, alias],
    { stdio: "inherit" },
  )

  if (sign.status !== 0) throw new Error("failed to sign the aab")
}

export interface AndroidBuildOptions {
  appDir: string
  manifest: AppManifest | null
  entry: string
  outDir: string
  abi?: string
  dev?: boolean
  aab?: boolean
}

export const clearStaleBuildDir = (buildDir: string, sourceDir: string): boolean => {
  const cache = join(buildDir, "CMakeCache.txt")

  if (!existsSync(cache)) return false

  const match = readFileSync(cache, "utf8").match(/^CMAKE_HOME_DIRECTORY:INTERNAL=(.+)$/m)
  const previous = match?.[1]?.trim()

  if (!previous || resolve(previous) === resolve(sourceDir)) return false

  rmSync(buildDir, { recursive: true, force: true })

  return true
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

    ui.step(`${e instanceof Error ? e.message : String(e)}`)
    ui.step("installing the Android toolchain (one time, ~2 GB)")

    tools = await installAndroid(cliVersion())
  }

  if (!opensslComplete()) {
    if (process.env.PULSAR_NO_INSTALL === "1") {
      throw new Error("OpenSSL for Android TLS is missing; run: pulsar install --android")
    }

    await installOpenssl()
  }

  const name = manifest?.name ?? basename(appDir)
  const packageName = androidPackageName(manifest, dev)
  const appLabel = dev ? `${name} (dev)` : name
  const versionName = manifest?.version ?? "0.1.0"

  ui.step(`android ${abi} ${dev ? "dev " : ""}-> ${name}${dev ? "-dev" : ""}.apk`)
  console.log(`  qt:  ${tools.qt}`)
  console.log(`  host: ${tools.hostQt}`)
  console.log(`  sdk: ${tools.sdk}`)
  console.log(`  ndk: ${tools.ndk}`)

  const sourceDir = pulsarRoot()
  const buildDir = join(appDir, "build", `android-${abi}${dev ? "-dev" : ""}`)

  if (clearStaleBuildDir(buildDir, sourceDir)) {
    ui.step("cleared the Android build cache from another Pulsar version")
  }

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
  const permissions = androidPermissions(manifest)
  const packageSources = preparePackageSources(buildDir, tools.qt, manifest)

  const configure = spawnSync(
    qtCmake,
    [
      "-S",
      sourceDir,
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
      ...(permissions.length > 0 ? [`-DPULSAR_ANDROID_PERMISSIONS=${permissions.join(";")}`] : []),
      ...(dev ? ["-DPULSAR_ANDROID_DEV=ON"] : []),
      `-DPULSAR_ANDROID_VIDEO=${wantsVideo(appDir, manifest) ? "ON" : "OFF"}`,
      `-DPULSAR_ANDROID_PACKAGE_DIR=${packageSources ?? ""}`,
      `-DPULSAR_ANDROID_OPENSSL_DIR=${opensslDir()}`,
      `-DQT_HOST_PATH=${tools.hostQt}`,
    ],
    { stdio: "inherit", env },
  )

  if (configure.status !== 0) throw new Error("android configure failed")

  patchDeploymentTools(join(buildDir, "android-pulsar-android-deployment-settings.json"), tools.hostQt)

  // androiddeployqt only adds to libs/, so the FFmpeg libraries of an earlier "video": true build would stay.
  rmSync(join(buildDir, "android-build", "libs"), { recursive: true, force: true })

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

  ui.done(`built ${resolve(finalPath)} (${mb} MB)`)

  if (options.aab) {
    const androidBuildDir = join(buildDir, "android-build")
    const gradlew = join(androidBuildDir, process.platform === "win32" ? "gradlew.bat" : "gradlew")
    const bundle = spawnSync(gradlew, ["bundleRelease"], { cwd: androidBuildDir, stdio: "inherit", env })

    if (bundle.status !== 0) throw new Error("android bundle build failed")

    const bundleDir = join(androidBuildDir, "build", "outputs", "bundle", "release")
    const file = existsSync(bundleDir) ? readdirSync(bundleDir).find((entry) => entry.endsWith(".aab")) : undefined

    if (!file) throw new Error(`aab not found in ${bundleDir}`)

    const aabPath = join(outDir, `${name}${dev ? "-dev" : ""}.aab`)

    signAab(join(bundleDir, file), aabPath, tools)

    ui.done(`built ${resolve(aabPath)} (${(statSync(aabPath).size / (1024 * 1024)).toFixed(1)} MB)`)
  }

  return finalPath
}
