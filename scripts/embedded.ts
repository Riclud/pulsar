#!/usr/bin/env bun
// Bundles a portable app and runs it inside the embedded QuickJS host.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

const root = resolve(import.meta.dir, "..")
const binary = join(root, "build", "bin", process.platform === "win32" ? "qjs-runtime.exe" : "qjs-runtime")

const build = Bun.spawnSync({
  cmd: ["cmake", "--build", "build", "--target", "qjs-runtime"],
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
})

if (build.exitCode !== 0 || !existsSync(binary)) {
  console.error("embedded: qjs-runtime is not built")
  process.exit(1)
}

const config = {
  entrypoints: [join(root, "tests", "embedded", "run.ts")],
  target: "browser",
  format: "iife",
  write: false,
} as unknown as Parameters<typeof Bun.build>[0]

const result = await Bun.build(config)

if (!result.success) {
  for (const log of result.logs) console.error(log.message)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), "pulsar-embedded-"))

try {
  const bundle = join(tmp, "app.js")
  const manifest = join(tmp, "pulsar.json")

  writeFileSync(bundle, await result.outputs[0]!.text())
  writeFileSync(manifest, JSON.stringify({ id: "com.pulsar.embedded", windows: [] }))

  const run = Bun.spawnSync({
    cmd: [binary, bundle, manifest],
    cwd: tmp,
    env: {
      ...process.env,
      PULSAR_APP: tmp,
      AUTO_QUIT_MS: "2000",
      XDG_DATA_HOME: join(tmp, "data"),
      XDG_CONFIG_HOME: join(tmp, "config"),
      XDG_CACHE_HOME: join(tmp, "cache"),
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdout = run.stdout.toString()
  const stderr = run.stderr.toString()

  if (run.exitCode !== 0 || !`${stdout}\n${stderr}`.includes('"method":"RESULT","ok":true')) {
    console.error(stdout)
    console.error(stderr)
    console.error("embedded: FAILED")
    process.exit(1)
  }

  console.log("embedded: OK")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
