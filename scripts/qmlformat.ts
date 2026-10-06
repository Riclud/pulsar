#!/usr/bin/env bun
// Cross-platform replacement for scripts/qmlformat.sh. Resolves Qt 6's
// qmlformat (PATH may point at Qt 5) and formats the tracked QML files, or
// forwards explicit arguments.
import { existsSync } from "node:fs"
import { join } from "node:path"

const exe = process.platform === "win32" ? ".exe" : ""

function fromQmake(): string | null {
  for (const qmake of ["qmake6", "qmake"]) {
    const probe = Bun.spawnSync({ cmd: [qmake, "-query", "QT_INSTALL_BINS"], stdout: "pipe", stderr: "ignore" })
    if (probe.exitCode !== 0) continue
    const dir = probe.stdout.toString().trim()
    if (!dir) continue
    const candidate = join(dir, "qmlformat" + exe)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function findQmlformat(): string {
  const fromQmakeResult = fromQmake()
  if (fromQmakeResult) return fromQmakeResult
  if (existsSync("/usr/lib/qt6/bin/qmlformat")) return "/usr/lib/qt6/bin/qmlformat"
  const fromPath = Bun.which("qmlformat")
  if (fromPath) return fromPath
  throw new Error("qmlformat not found (Qt 6 tools). Add it to PATH or set PULSAR_QMAKE.")
}

let files = process.argv.slice(2)
if (files.length === 0) {
  const ls = Bun.spawnSync({ cmd: ["git", "ls-files", "*.qml"], stdout: "pipe", stderr: "ignore" })
  files = ls.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

if (files.length === 0) {
  console.log("qmlformat: no .qml files")
  process.exit(0)
}

const result = Bun.spawnSync({ cmd: [findQmlformat(), "-i", ...files], stdio: ["inherit", "inherit", "inherit"] })
process.exit(result.exitCode ?? 1)
