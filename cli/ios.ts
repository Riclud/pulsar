import { spawnSync } from "child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs"
import { basename, join, resolve } from "path"
import type { AppManifest } from "../core/sdk/manifest.ts"
import { appFiles, bundleRuntime, hashFiles, writeQrc } from "./android.ts"
import { pulsarRoot } from "./core.ts"
import { ui } from "./ui.ts"

export interface IosBuildOptions {
  appDir: string
  manifest: AppManifest | null
  entry: string
  outDir: string
}

const requireEnv = (name: string, hint: string): string => {
  const value = process.env[name]

  if (!value) throw new Error(`${name} is not set; ${hint}`)

  return value
}

const findApp = (dir: string): string | null => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const path = join(dir, entry.name)

    if (entry.name === "pulsar-ios.app") return path

    const nested = findApp(path)

    if (nested) return nested
  }

  return null
}

export const buildIos = async (options: IosBuildOptions): Promise<string> => {
  const { appDir, manifest, entry, outDir } = options

  if (process.platform !== "darwin") throw new Error("the ios target needs macOS with Xcode")

  const qt = requireEnv("PULSAR_IOS_QT", "point it at a Qt for iOS kit, such as ~/Qt/6.9.3/ios")
  const hostQt = requireEnv("QT_HOST_PATH", "point it at the desktop Qt of the same version")
  const name = manifest?.name ?? basename(appDir)
  const buildDir = join(appDir, "build", "ios-simulator")
  const assembly = join(buildDir, "app")

  ui.step(`ios simulator (experimental) -> ${name}.app`)

  mkdirSync(assembly, { recursive: true })

  const { result } = bundleRuntime(entry, assembly)
  const bundle = await result

  if (!bundle.success) throw new Error("failed to bundle the portable runtime")

  const bundleText = await bundle.outputs[0]!.text()

  writeFileSync(join(assembly, "runtime.js"), bundleText)

  const files = appFiles(appDir, manifest)
  const qrc = writeQrc(join(assembly, "app.qrc"), files, appDir, [
    { alias: "runtime.js", path: join(assembly, "runtime.js") },
  ])

  const configure = spawnSync(
    join(qt, "bin", "qt-cmake"),
    [
      "-S",
      pulsarRoot(),
      "-B",
      buildDir,
      "-G",
      "Xcode",
      `-DQT_HOST_PATH=${hostQt}`,
      `-DPULSAR_IOS_APP_QRC=${qrc}`,
      `-DPULSAR_IOS_BUILD_ID=${hashFiles(files, appDir, bundleText)}`,
      `-DPULSAR_IOS_APP_NAME=${name}`,
      `-DPULSAR_IOS_BUNDLE_ID=${manifest?.id ?? `com.pulsar.${name}`}`,
    ],
    { stdio: "inherit" },
  )

  if (configure.status !== 0) throw new Error("ios configure failed")

  const compile = spawnSync(
    "cmake",
    [
      "--build",
      buildDir,
      "--target",
      "pulsar-ios",
      "--config",
      "Release",
      "--",
      "-sdk",
      "iphonesimulator",
      "-arch",
      "x86_64",
      "CODE_SIGNING_ALLOWED=NO",
    ],
    { stdio: "inherit" },
  )

  if (compile.status !== 0) throw new Error("ios build failed")

  const app = findApp(buildDir)

  if (!app) throw new Error(`pulsar-ios.app not found in ${buildDir}`)

  mkdirSync(outDir, { recursive: true })

  const finalPath = resolve(outDir, `${name}.app`)

  if (existsSync(finalPath)) rmSync(finalPath, { recursive: true })

  cpSync(app, finalPath, { recursive: true, verbatimSymlinks: true })

  ui.done(`built ${finalPath}`)

  return finalPath
}
