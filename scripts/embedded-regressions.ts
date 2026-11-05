#!/usr/bin/env bun
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { bundleRuntime } from "../cli/android.ts"

type Scenario = {
  name: string
  standalone?: boolean
  desktop?: boolean
  env?: Record<string, string>
  check: (output: string) => boolean
}

const root = resolve(import.meta.dir, "..")
const fixtures = join(root, "tests", "embedded", "regressions")
const override = process.env.PULSAR_EMBEDDED_HOST
const binary =
  override ?? join(root, "build", "bin", process.platform === "win32" ? "qml-host-qjs.exe" : "qml-host-qjs")

const desktopBinary = join(root, "build", "bin", process.platform === "win32" ? "qml-host.exe" : "qml-host")

const slowStream = () => {
  let sent = 0

  return new ReadableStream({
    pull: async (controller) => {
      await Bun.sleep(100)

      controller.enqueue(new Uint8Array(1))

      sent++

      if (sent === 8) controller.close()
    },
  })
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  fetch: async (request) => {
    if (request.method === "PUT") return new Response(String((await request.arrayBuffer()).byteLength))

    if (!request.url.endsWith("/slow")) return new Response(new Uint8Array(70 * 1024 * 1024))

    return new Response(slowStream())
  },
})

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
    name: "motion",
    env: { PULSAR_TRANSITION: "none" },
    check: (output) => {
      return (
        output.includes("PulsarView enter /root/added") &&
        output.includes("PulsarView exit done /root/removed") &&
        output.includes("PulsarView hide done /root/hidden") &&
        output.includes("PulsarView enter /root/hidden") &&
        output.includes("PulsarView enter /root/flip") &&
        !output.includes("PulsarView hide done /root/flip") &&
        !/PulsarView\.qml:\d+: (?!TypeError: Cannot (read property 'colorScheme'|call method '(devMode|env)') of null)/.test(
          output,
        )
      )
    },
  },
  {
    name: "stable-paths",
    env: { PULSAR_TRANSITION: "none" },
    check: (output) => {
      const patches = output.split("\n").filter((line) => line.includes("PulsarView patch"))
      const builds = output.split("\n").filter((line) => line.includes("PulsarView built"))

      return (
        patches.length === 3 &&
        patches[0]!.includes(" +0 ~1 -0 ") &&
        patches[1]!.includes(" +0 ~1 -0 ") &&
        patches[2]!.includes(" +1 ") &&
        patches[2]!.includes(" -0 ") &&
        builds.at(-1)?.includes(" +3 ~0 -0 ") === true
      )
    },
  },
  {
    name: "layout",
    check: (output) => {
      return (
        output.includes("SIZE one 100") &&
        output.includes("SIZE two 200") &&
        output.includes("SIZE fixed 40") &&
        output.includes("SIZE after 360") &&
        output.includes("SIZE wide 400") &&
        output.includes("SIZE padded 48") &&
        output.includes("SIZE around 40") &&
        output.includes("SIZE elevated 72")
      )
    },
  },
  {
    name: "focus",
    check: (output) => {
      return (
        output.includes("FIELD focus") &&
        output.includes("PulsarView reorder") &&
        !output.includes("FIELD blur") &&
        output.includes("SIZE flexed 400")
      )
    },
  },
  {
    name: "flex-patch",
    check: (output) => {
      const lines = output.split("\n")
      const last = (name: string) => lines.filter((line) => line.includes(`SIZE ${name} `)).at(-1) ?? ""

      return last("across").includes("SIZE across 200 20") && last("down").includes("SIZE down 20 50")
    },
  },
  {
    name: "hidden-padding",
    check: (output) => {
      const sizes = output.split("\n").filter((line) => line.includes("SIZE padded "))

      return (sizes.at(-1) ?? "").includes("SIZE padded 112")
    },
  },
  {
    name: "packing",
    check: (output) => {
      return (
        output.includes("PulsarView packed /root/frame/tall") &&
        output.includes("PulsarView packed /root/frame/tall/wide") &&
        !output.includes("PulsarView packed /root/frame/tall/hug") &&
        !output.includes("PulsarView packed /root/frame/filled")
      )
    },
  },
  {
    name: "states",
    check: (output) => {
      return (
        output.includes("PulsarView state disabled /root/panel") &&
        output.includes("PulsarView state normal /root/panel") &&
        output.includes("SIZE filled 400") &&
        !/PulsarView\.qml:\d+: (?!TypeError: Cannot (read property 'colorScheme'|call method '(devMode|env)') of null)/.test(
          output,
        )
      )
    },
  },
  {
    name: "jsx",
    check: (output) => output.includes("PulsarView built 1") && output.includes("JSX_OK 2"),
  },
  {
    name: "jsx-desktop",
    desktop: true,
    check: (output) => output.includes("PulsarView built 1") && output.includes("JSX_OK 2"),
  },
  {
    name: "late-window",
    desktop: true,
    check: (output) => lastBuilt(output)?.includes(" +3 ~0 -0 ") === true,
  },
  {
    name: "large-download",
    env: { AUTO_QUIT_MS: "30000" },
    check: (output) => {
      return (
        output.includes("DOWNLOAD_DONE 73400320") &&
        output.includes("SLOW_DONE 8") &&
        output.includes("UPLOAD_DONE 3145728") &&
        output.includes("FETCH_LIMITED ERR_TOO_LARGE")
      )
    },
  },
  {
    name: "late-catch",
    check: (output) => output.includes("LATE_CATCH_HANDLED") && !output.includes("ERROR OVERLAY"),
  },
]

const buildHost = () => {
  if (override) return existsSync(override)

  const build = Bun.spawnSync({
    cmd: ["cmake", "--build", "build", "--target", "qml-host-qjs", "qml-host", "bridge"],
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
  })

  return build.exitCode === 0 && existsSync(binary)
}

const fixtureOf = (name: string) => {
  const tsx = join(fixtures, `${name}.tsx`)

  return existsSync(tsx) ? tsx : join(fixtures, `${name}.ts`)
}

const buildBundle = (scenario: Scenario, dir: string) => {
  const entry = fixtureOf(scenario.name)

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

const prepareDesktop = (scenario: Scenario, dir: string) => {
  writeFileSync(join(dir, "main.ts"), `import ${JSON.stringify(fixtureOf(scenario.name))}\n`)
  writeFileSync(join(dir, "pulsar.json"), JSON.stringify(manifest))
}

const runScenario = async (scenario: Scenario) => {
  if (scenario.desktop && override) return true

  const dir = mkdtempSync(join(tmpdir(), "pulsar-regression-"))
  const hostLog = join(dir, "host.log")

  try {
    if (scenario.desktop) prepareDesktop(scenario, dir)
    else await bundle(scenario, dir)

    const run = Bun.spawn({
      cmd: [scenario.desktop ? desktopBinary : binary],
      cwd: dir,
      env: {
        ...process.env,
        PULSAR_TEST_URL: `http://127.0.0.1:${server.port}/blob`,
        ...scenario.env,
        PULSAR_APP: dir,
        PULSAR_DEBUG: "1",
        QT_QPA_PLATFORM: "offscreen",
        AUTO_QUIT_MS: "1500",
        ...scenario.env,
        QT_LOG_FILE: hostLog,
        XDG_DATA_HOME: join(dir, "data"),
        XDG_CONFIG_HOME: join(dir, "config"),
        XDG_CACHE_HOME: join(dir, "cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
      run.exited,
    ])
    const hostOutput = existsSync(hostLog) ? readFileSync(hostLog, "utf8") : ""
    const output = `${stdout}\n${stderr}\n${hostOutput}`
    const passed = exitCode === 0 && scenario.check(output) && !output.includes("recursive rearrange") && !output.includes("read-only property")

    console.log(`${passed ? "ok  " : "FAIL"} ${scenario.name} (exit ${exitCode})`)

    if (!passed && process.env.PULSAR_REGRESSION_VERBOSE) console.error(output)

    return passed
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (!buildHost()) {
  server.stop(true)
  console.error("embedded-regressions: qml-host-qjs is not built")
  process.exit(1)
}

let failed = 0

for (const scenario of scenarios) {
  const passed = await runScenario(scenario)

  if (!passed) failed++
}

server.stop(true)

if (failed > 0) {
  console.error(`embedded-regressions: ${failed} FAILED`)
  process.exit(1)
}

console.log("embedded-regressions: OK")
