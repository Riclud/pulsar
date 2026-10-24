#!/usr/bin/env bun
// Bundles the portable runtime harness and runs it under QuickJS. This proves
// the core and capabilities do not depend on Bun/Node APIs.
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

const root = resolve(import.meta.dir, "..")
const qjs = process.env.QJS ?? "qjs"

const which = Bun.spawnSync({ cmd: ["sh", "-c", `command -v ${qjs}`], stdio: ["ignore", "pipe", "ignore"] })
if (which.exitCode !== 0) {
  console.log(`portable: ${qjs} not found; skipping`)
  process.exit(0)
}

const config = {
  entrypoints: [join(root, "tests", "portable", "run.ts")],
  target: "browser",
  format: "esm",
  splitting: false,
  write: false,
} as unknown as Parameters<typeof Bun.build>[0]

const result = await Bun.build(config)

if (!result.success) {
  for (const log of result.logs) console.error(log.message)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), "pulsar-portable-"))
try {
  const bundle = join(tmp, "app.mjs")
  writeFileSync(bundle, await result.outputs[0]!.text())

  const run = Bun.spawnSync({ cmd: [qjs, "--module", bundle], stdout: "pipe", stderr: "pipe" })
  const stdout = run.stdout.toString()
  const stderr = run.stderr.toString()

  if (run.exitCode !== 0 || !stdout.includes("PORTABLE_RESULT true")) {
    console.error(stderr || stdout)
    console.error("portable: FAILED")
    process.exit(1)
  }

  console.log("portable: OK")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
