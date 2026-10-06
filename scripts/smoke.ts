#!/usr/bin/env bun
// Headless end-to-end smoke test: config, initial state sync, live push, and
// Bun supervision. Cross-platform replacement for scripts/smoke.sh.
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const host = join(root, "zig-out", "bin", process.platform === "win32" ? "qml-host.exe" : "qml-host")

const build = Bun.spawnSync({ cmd: ["zig", "build", "-j1"], cwd: root, stdio: ["inherit", "inherit", "inherit"] })
if (build.exitCode !== 0) {
  console.error("smoke: build failed")
  process.exit(build.exitCode ?? 1)
}

const tmp = mkdtempSync(join(tmpdir(), "pulsar-smoke-"))
const log = join(tmp, "main.log")
const crashLog = join(tmp, "crash.log")
const bigLog = join(tmp, "big.log")
const callLog = join(tmp, "call.log")
const qmlErrLog = join(tmp, "qml-error.log")
const storageLog = join(tmp, "storage.log")

let failed = false

function runHost(env: Record<string, string>) {
  Bun.spawnSync({ cmd: [host], cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "ignore"] })
}

function check(file: string, needle: string) {
  let text = ""
  try {
    text = readFileSync(file, "utf8")
  } catch {}
  if (!text.includes(needle)) {
    console.error(`smoke: missing: ${needle}`)
    failed = true
  }
}

try {
  runHost({
    PULSAR_DEBUG: "1",
    QT_QPA_PLATFORM: "offscreen",
    AUTO_QUIT_MS: "4000",
    SELFTEST: "1500",
    QT_LOG_FILE: log,
  })

  check(log, "NOTIFY __config")
  check(log, "STORE name = QVariant(QString, tick 0)")
  check(log, "STORE name = QVariant(QString, tick 1)")
  check(log, "SELFTEST resp")

  // Bun supervision: a dying runtime must be detected and reported by the host.
  runHost({
    PULSAR_DEBUG: "1",
    QT_QPA_PLATFORM: "offscreen",
    PULSAR_TEST_CRASH_MS: "800",
    AUTO_QUIT_MS: "6000",
    QT_LOG_FILE: crashLog,
  })
  check(crashLog, "bun crashed")

  // Large messages: a state snapshot well beyond the old 64 KiB line limit
  // must still reach the host intact.
  runHost({
    PULSAR_DEBUG: "1",
    QT_QPA_PLATFORM: "offscreen",
    PULSAR_TEST_BIG_ITEMS: "20000",
    AUTO_QUIT_MS: "4000",
    QT_LOG_FILE: bigLog,
  })
  check(bigLog, "STORE big (list size 20000")

  // QML -> capability round trip through the promise API.
  runHost({
    PULSAR_DEBUG: "1",
    QT_QPA_PLATFORM: "offscreen",
    QML_MAIN: join(root, "tests", "qml", "call.qml"),
    AUTO_QUIT_MS: "4000",
    QT_LOG_FILE: callLog,
  })
  check(callLog, "CALLRESULT true")
  check(callLog, "CALLCLIP hi pulsar")

  // Error surface: a broken app QML must surface a clear message instead of a
  // silent exit.
  runHost({
    PULSAR_DEBUG: "1",
    QT_QPA_PLATFORM: "offscreen",
    PULSAR_APP: join(root, "tests", "apps", "bad-qml"),
    AUTO_QUIT_MS: "4000",
    QT_LOG_FILE: qmlErrLog,
  })
  check(qmlErrLog, "app failed to load")

  // Storage + app paths: a fixture app persists a value and reports it via the
  // store; XDG dirs point at temp so the user's home stays untouched.
  runHost({
    PULSAR_DEBUG: "1",
    QT_QPA_PLATFORM: "offscreen",
    PULSAR_APP: join(root, "tests", "apps", "storage-app"),
    XDG_DATA_HOME: join(tmp, "data"),
    XDG_CONFIG_HOME: join(tmp, "config"),
    XDG_CACHE_HOME: join(tmp, "cache"),
    HOME: join(tmp, "home"),
    AUTO_QUIT_MS: "4000",
    QT_LOG_FILE: storageLog,
  })
  check(storageLog, "STORE storageOk = QVariant(bool, true)")
  check(storageLog, "min= 320")
  check(storageLog, "resizable= false")

  if (failed) {
    console.error("smoke: FAILED")
    process.exitCode = 1
  } else {
    console.log("smoke: OK")
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
