#!/usr/bin/env bun
// Check that an uncaught JS error shows the dev overlay in the embedded host.
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { prebuilt } from "./lib/pool.ts"
import { parseInlineSourceMap } from "../cli/sourcemap.ts"
import { cmakeParallel } from "../cli/jobs.ts"

const root = resolve(import.meta.dir, "..")
const binary = join(root, "build", "bin", process.platform === "win32" ? "qml-host-qjs.exe" : "qml-host-qjs")

const build = prebuilt()
  ? { exitCode: 0 }
  : Bun.spawnSync({
      cmd: ["cmake", "--build", "build", "--target", "qml-host-qjs", ...cmakeParallel()],
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
    })

if (build.exitCode !== 0 || !existsSync(binary)) {
  console.error("error-overlay: qml-host-qjs is not built")
  process.exit(1)
}

const fixture = join(root, "tests", "embedded", "error")
const result = await Bun.build({
  entrypoints: [join(fixture, "main.ts")],
  target: "browser",
  format: "iife",
  write: false,
  sourcemap: "inline",
} as unknown as Parameters<typeof Bun.build>[0])

if (!result.success) {
  for (const log of result.logs) console.error(log.message)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), "pulsar-error-overlay-"))

try {
  const bundle = await result.outputs[0]!.text()

  cpSync(join(fixture, "pulsar.json"), join(tmp, "pulsar.json"))
  writeFileSync(join(tmp, "runtime.js"), bundle)

  const run = Bun.spawnSync({
    cmd: [binary],
    cwd: tmp,
    env: {
      ...process.env,
      PULSAR_APP: tmp,
      PULSAR_DEBUG: "1",
      PULSAR_UI_AUTOCLICK_MS: "300",
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

  const frame = output.split("\n").find((line) => line.includes(" at ") && line.includes("runtime.js:"))
  const location = frame?.match(/runtime\.js:(\d+):(\d+)/)
  const mapped = location ? parseInlineSourceMap(bundle)?.map(Number(location[1]), Number(location[2])) : null

  if (
    run.exitCode !== 0 ||
    !output.includes("ERROR OVERLAY") ||
    !output.includes("overlay test error") ||
    !mapped ||
    !mapped.source.endsWith("main.ts")
  ) {
    console.error(output)
    console.error(`error-overlay: FAILED (mapped=${JSON.stringify(mapped)})`)
    process.exit(1)
  }

  console.log(`error-overlay: OK (${mapped.source}:${mapped.line}:${mapped.column})`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
