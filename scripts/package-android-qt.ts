#!/usr/bin/env bun
// Package Qt 6.9.3 for Android (target + matching host tools) into one asset:
//   dist/pulsar-android-qt-6.9.3-<platform>.tar.gz
//
// Layout keeps Qt's own relative host lookup working:
//   6.9.3/gcc_64/             host Qt (moc, rcc, qmlcachegen, androiddeployqt)
//   6.9.3/android_arm64_v8a/  target Qt (libraries, plugins, QML, templates)
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs"
import { join, relative, resolve, sep } from "path"
import { platformId } from "../cli/core.ts"
import { ANDROID_ABI, ANDROID_QT_VERSION } from "../cli/android.ts"

const root = resolve(import.meta.dir, "..")
const out = join(root, "dist")
const platform = platformId()
const qtRoot = process.env.PULSAR_QT_ROOT ?? join(process.env.HOME ?? ".", "Qt", ANDROID_QT_VERSION)
const hostQt = process.env.PULSAR_QT_HOST ?? join(qtRoot, "gcc_64")
const targetQt = process.env.PULSAR_ANDROID_QT ?? join(qtRoot, `android_${ANDROID_ABI.replace("-", "_")}`)

const SKIP = new Set(["doc", "docs", "examples", "tests", "sbom", "translations"])

function copyTree(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      const rel = relative(from, source)
      if (!rel) return true
      return !SKIP.has(rel.split(sep)[0] ?? "")
    },
  })
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
mkdirSync(versionDir, { recursive: true })
copyTree(hostQt, join(versionDir, "gcc_64"))
copyTree(targetQt, join(versionDir, `android_${ANDROID_ABI.replace("-", "_")}`))

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
