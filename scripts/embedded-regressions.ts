#!/usr/bin/env bun
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { bundleRuntime } from "../cli/android.ts"

type Scenario = {
  name: string
  standalone?: boolean
  env?: Record<string, string>
  check: (output: string) => boolean
}

const root = resolve(import.meta.dir, "..")
const fixtures = join(root, "tests", "embedded", "regressions")
const override = process.env.PULSAR_EMBEDDED_HOST
const binary = override ?? join(root, "build", "bin", process.platform === "win32" ? "qml-host-qjs.exe" : "qml-host-qjs")

const manifest = {
  id: "com.pulsar.regressions",
  name: "regressions",
  version: "0.1.0",
  main: "main.ts",
  windows: [{ label: "main", width: 320, height: 240, title: "Regressions" }],
}

const lastBuilt = (output: string) => {
  return output
    .split("\n")
    .filter((line) => line.includes("PulsarView built"))
    .at(-1)
}

const scenarios: Scenario[] = [
  {
    name: "timer-self-clear",
    check: (output) => output.includes("TIMER_DONE 20000"),
  },
  {
    name: "early-patch",
    standalone: true,
    check: (output) => output.includes("PulsarView patch 1"),
  },
  {
    name: "reload",
    env: { AUTO_RELOAD_MS: "300" },
    check: (output) => lastBuilt(output)?.includes(" +2 ~0 -0 ") === true,
  },
  {
    name: "rejection",
    check: (output) => output.includes("ERROR OVERLAY") && output.includes("UNHANDLED_ASYNC"),
  },
  {
    name: "top-level-throw",
    check: (output) => output.includes("ERROR OVERLAY") && output.includes("TOP_LEVEL_THROW"),
  },
  {
    name: "late-catch",
    check: (output) => output.includes("LATE_CATCH_HANDLED") && !output.includes("ERROR OVERLAY"),
  },
]

const buildHost = () => {
  if (override) return existsSync(override)

  const build = Bun.spawnSync({
    cmd: ["cmake", "--build", "build", "--target", "qml-host-qjs"],
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
  })

  return build.exitCode === 0 && existsSync(binary)
}

const buildBundle = (scenario: Scenario, dir: string) => {
  const entry = join(fixtures, `${scenario.name}.ts`)

  if (!scenario.standalone) return bundleRuntime(entry, dir).result

  return Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "iife",
    write: false,
  } as unknown as Parameters<typeof Bun.build>[0])
}

const bundle = async (scenario: Scenario, dir: string) => {
  const output = await buildBundle(scenario, dir)

  if (!output.success) throw new Error(`cannot bundle ${scenario.name}`)

  writeFileSync(join(dir, "runtime.js"), await output.outputs[0]!.text())
  writeFileSync(join(dir, "pulsar.json"), JSON.stringify(manifest))
}

const runScenario = async (scenario: Scenario) => {
  const dir = mkdtempSync(join(tmpdir(), "pulsar-regression-"))

  try {
    await bundle(scenario, dir)

    const run = Bun.spawnSync({
      cmd: [binary],
      cwd: dir,
      env: {
        ...process.env,
        ...scenario.env,
        PULSAR_APP: dir,
        PULSAR_DEBUG: "1",
        QT_QPA_PLATFORM: "offscreen",
        AUTO_QUIT_MS: "1500",
        XDG_DATA_HOME: join(dir, "data"),
        XDG_CONFIG_HOME: join(dir, "config"),
        XDG_CACHE_HOME: join(dir, "cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    const output = `${run.stdout.toString()}\n${run.stderr.toString()}`
    const passed = run.exitCode === 0 && scenario.check(output)

    console.log(`${passed ? "ok  " : "FAIL"} ${scenario.name} (exit ${run.exitCode})`)

    if (!passed && process.env.PULSAR_REGRESSION_VERBOSE) console.error(output)

    return passed
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (!buildHost()) {
  console.error("embedded-regressions: qml-host-qjs is not built")
  process.exit(1)
}

let failed = 0

for (const scenario of scenarios) {
  const passed = await runScenario(scenario)

  if (!passed) failed++
}

if (failed > 0) {
  console.error(`embedded-regressions: ${failed} FAILED`)
  process.exit(1)
}

console.log("embedded-regressions: OK")
