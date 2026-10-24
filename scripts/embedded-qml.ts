#!/usr/bin/env bun
// Bundles an app for the embedded QuickJS QML host and runs it headlessly.
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

const root = resolve(import.meta.dir, "..")
const binary = join(root, "build", "bin", process.platform === "win32" ? "qml-host-qjs.exe" : "qml-host-qjs")

const build = Bun.spawnSync({
  cmd: ["cmake", "--build", "build", "--target", "qml-host-qjs"],
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
})
if (build.exitCode !== 0 || !existsSync(binary)) {
  console.error("embedded-qml: qml-host-qjs is not built")
  process.exit(1)
}

const config = {
  entrypoints: [join(root, "tests", "embedded", "qml", "main.ts")],
  target: "browser",
  format: "iife",
  write: false,
} as unknown as Parameters<typeof Bun.build>[0]

const result = await Bun.build(config)
if (!result.success) {
  for (const log of result.logs) console.error(log.message)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), "pulsar-embedded-qml-"))
try {
  cpSync(join(root, "tests", "embedded", "qml", "pulsar.json"), join(tmp, "pulsar.json"))
  cpSync(join(root, "tests", "embedded", "qml", "ui"), join(tmp, "ui"), { recursive: true })
  writeFileSync(join(tmp, "runtime.js"), await result.outputs[0]!.text())

  const run = Bun.spawnSync({
    cmd: [binary],
    cwd: tmp,
    env: {
      ...process.env,
      PULSAR_APP: tmp,
      QT_QPA_PLATFORM: "offscreen",
      AUTO_QUIT_MS: "1500",
      XDG_DATA_HOME: join(tmp, "data"),
      XDG_CONFIG_HOME: join(tmp, "config"),
      XDG_CACHE_HOME: join(tmp, "cache"),
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  const output = `${run.stdout.toString()}\n${run.stderr.toString()}`
  if (run.exitCode !== 0 || !output.includes("STORE greeting") || !output.includes("STORE pong")) {
    console.error(output)
    console.error("embedded-qml: FAILED")
    process.exit(1)
  }

  console.log("embedded-qml: OK")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
