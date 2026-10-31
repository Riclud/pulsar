#!/usr/bin/env bun
// Package Qt 6.9.3 for Android (target + matching host tools) into one asset:
//   dist/pulsar-android-qt-6.9.3-<platform>.tar.gz
//
// Layout keeps Qt's own relative host lookup working:
//   6.9.3/gcc_64/             host Qt (moc, rcc, qmlcachegen, androiddeployqt)
//   6.9.3/android_arm64_v8a/  target Qt (libraries, plugins, QML, templates)
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs"
import { dirname, join, relative, resolve, sep } from "path"
import { platformId } from "../cli/core.ts"
import { ANDROID_ABI, ANDROID_QT_VERSION } from "../cli/android.ts"

const root = resolve(import.meta.dir, "..")
const out = join(root, "dist")
const platform = platformId()
const qtRoot = process.env.PULSAR_QT_ROOT ?? join(process.env.HOME ?? ".", "Qt", ANDROID_QT_VERSION)
const hostQt = process.env.PULSAR_QT_HOST ?? join(qtRoot, "gcc_64")
const targetQt = process.env.PULSAR_ANDROID_QT ?? join(qtRoot, `android_${ANDROID_ABI.replace("-", "_")}`)

const SKIP = new Set(["doc", "docs", "examples", "tests", "sbom", "translations"])

const copyTree = (from: string, to: string): void => {
  const walk = (source: string, dest: string): void => {
    const rel = relative(from, source)
    const top = rel.split(sep)[0] ?? ""

    if (rel && SKIP.has(top)) return

    const info = lstatSync(source)

    if (info.isSymbolicLink()) {
      const target = resolve(dirname(source), readlinkSync(source))

      if (target.startsWith(from + sep) && existsSync(target)) {
        symlinkSync(relative(dirname(dest), join(to, relative(from, target))), dest)

        return
      }

      cpSync(target, dest)

      return
    }

    if (info.isDirectory()) {
      mkdirSync(dest, { recursive: true })

      for (const entry of readdirSync(source)) walk(join(source, entry), join(dest, entry))

      return
    }

    cpSync(source, dest)
  }

  walk(from, to)
}

for (const [label, path] of [
  ["host Qt", hostQt],
  ["target Qt", targetQt],
] as const) {
  if (!existsSync(path)) throw new Error(`${label} not found at ${path} (set PULSAR_QT_HOST / PULSAR_ANDROID_QT)`)
}

mkdirSync(out, { recursive: true })

const stage = join(out, ".stage-android-qt")

rmSync(stage, { recursive: true, force: true })

const versionDir = join(stage, ANDROID_QT_VERSION)
const targetDir = join(versionDir, `android_${ANDROID_ABI.replace("-", "_")}`)

mkdirSync(versionDir, { recursive: true })
copyTree(hostQt, join(versionDir, "gcc_64"))
copyTree(targetQt, targetDir)

const targetQtConf = join(targetDir, "bin", "target_qt.conf")

if (existsSync(targetQtConf)) {
  const conf = readFileSync(targetQtConf, "utf8")

  writeFileSync(targetQtConf, conf.replace(/^HostPrefix=.*$/m, "HostPrefix=../../gcc_64"))
}

const patchDir = join(root, "scripts", "android-qt-patch")
const androidJar = join(targetDir, "jar", "Qt6Android.jar")

if (existsSync(patchDir) && existsSync(androidJar)) {
  const classes: string[] = []

  const collect = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)

      if (entry.isDirectory()) {
        collect(abs)
        continue
      }

      classes.push(relative(patchDir, abs).split(sep).join("/"))
    }
  }

  collect(patchDir)

  const patched = spawnSync("zip", ["-q", "-X", androidJar, ...classes], { cwd: patchDir, stdio: "inherit" })

  if (patched.status !== 0) throw new Error("failed to patch the Android Qt input delegate")

  console.log(`patched Qt6Android.jar (${classes.length} classes)`)
}

const name = `pulsar-android-qt-${ANDROID_QT_VERSION}-${platform}.tar.gz`
const archive = join(out, name)
const relDest = relative(stage, archive).split(sep).join("/")

const tar = spawnSync("tar", ["-czf", relDest, "."], { cwd: stage, stdio: "inherit" })

if (tar.status !== 0) throw new Error(`tar failed for ${name}`)

rmSync(stage, { recursive: true, force: true })

const hash = createHash("sha256").update(readFileSync(archive)).digest("hex")
const sumsPath = join(out, "SHA256SUMS")

const previous = existsSync(sumsPath)
  ? readFileSync(sumsPath, "utf8")
      .split("\n")
      .filter((line) => line.length > 0 && !line.endsWith(`  ${name}`))
  : []

writeFileSync(sumsPath, [...previous, `${hash}  ${name}`].join("\n") + "\n")

const mb = (statSync(archive).size / (1024 * 1024)).toFixed(0)

console.log(`packaged ${name} (${mb} MB)`)
