#!/usr/bin/env bun
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { bundleRuntime } from "../cli/android.ts"
import { prebuilt, runPool, testJobs } from "./lib/pool.ts"

type Scenario = {
  name: string
  /** Measures timing or sizes over time, so it must not share the machine with other scenarios. */
  serial?: boolean
  standalone?: boolean
  desktop?: boolean
  /** Fixture file name, when it differs from the scenario name. */
  fixture?: string
  /** Extra files written into the app folder, by name. */
  files?: Record<string, string>
  /** Run the desktop host with the bundle on its in-process QuickJS runtime. */
  quickjsDesktop?: boolean
  env?: Record<string, string>
  check: (output: string) => boolean
}

const root = resolve(import.meta.dir, "..")
const fixtures = join(root, "tests", "embedded", "regressions")
const only = process.argv[2]
const override = process.env.PULSAR_EMBEDDED_HOST
const binary =
  override ?? join(root, "build", "bin", process.platform === "win32" ? "qml-host-qjs.exe" : "qml-host-qjs")

const desktopBinary = join(root, "build", "bin", process.platform === "win32" ? "qml-host.exe" : "qml-host")

const cryptoWorks = (output: string) => {
  return (
    output.includes("CRYPTO_RANDOM 24 true") &&
    output.includes("CRYPTO_PBKDF2 xeR41ZKIyEGqUw22hFxMjZYok6ABzk4RpJY4c6qYE0o=") &&
    output.includes("CRYPTO_REJECTED null") &&
    output.includes("SYSTEM_LOCALE ru-RU ru")
  )
}

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
    serial: true,
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "3200" },
    check: (output) => {
      return (
        output.includes("PulsarView enter /root/added") &&
        output.includes("PulsarView exit done /root/removed") &&
        output.includes("PulsarView hide done /root/hidden") &&
        output.includes("PulsarView enter /root/hidden") &&
        output.includes("PulsarView enter /root/flip") &&
        !output.includes("PulsarView hide done /root/flip") &&
        !/(?:PulsarView|nodes\/\w+)\.qml:\d+: (?!TypeError: Cannot (read property 'colorScheme'|call method '(devMode|env)') of null)/.test(
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
    name: "rtl",
    serial: true,
    env: { AUTO_QUIT_MS: "3500" },
    check: (output) => {
      const settled = new Map<string, string>()
      const phases: string[] = []

      for (const line of output.split("\n")) {
        const mark = line.match(/PHASE (ltr|rtl)$/)
        const pos = line.match(/POS (\w+) (\d+)$/)

        if (mark) phases.push("")
        if (pos) settled.set(`${phases.length}:${pos[1]}`, pos[2]!)
      }

      const row = (phase: number) => ["a", "b", "start", "end"].map((name) => settled.get(`${phase}:${name}`))

      return (
        phases.length === 3 &&
        row(1).join() === "10,55,10,360" &&
        row(2).join() === "350,315,350,0" &&
        row(3).join() === "10,55,10,360"
      )
    },
  },
  {
    name: "column-gap-motion",
    serial: true,
    env: { AUTO_QUIT_MS: "6500" },
    check: (output) => {
      const lines = output.split("\n")
      const from = lines.findIndex((line) => line.includes("PHASE hide"))
      const ys = lines
        .slice(from)
        .map((line) => line.match(/LAST (\d+)$/)?.[1])
        .filter((value) => value !== undefined)
        .map(Number)
      const jumps = ys.slice(1).map((value, index) => Math.abs(value - ys[index]!))

      // A 60 px gap that jumps instead of following the height shows as one step of 60.
      return from >= 0 && ys.length > 20 && Math.min(...ys) === 100 && Math.max(...jumps) < 25
    },
  },
  {
    name: "focus",
    check: (output) => {
      return output.includes("FIELD focus") && !output.includes("FIELD blur") && output.includes("SIZE flexed 400")
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
    name: "shell-enter",
    serial: true,
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "1600" },
    check: (output) => {
      const heights = (output.match(/SIZE entering (\d+)/g) ?? []).map((line) => Number(line.split(" ")[2]))
      const growing = new Set(heights.filter((height) => height > 8 && height < 72))

      return growing.size >= 3 && heights.at(-1) === 80
    },
  },
  {
    name: "qml-keeps-item",
    env: { AUTO_QUIT_MS: "1500" },
    files: {
      "probe.qml": [
        "import QtQuick",
        "Item {",
        "    property var pulsarEmit: null",
        "    property int step: 0",
        '    Component.onCompleted: console.log("QML_PROBE created")',
        '    onStepChanged: console.log("QML_PROBE step " + step)',
        "}",
      ].join("\n"),
    },
    check: (output) => {
      return (output.match(/QML_PROBE created/g) ?? []).length === 1 && output.includes("QML_PROBE step 3")
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
    name: "canvas",
    serial: true,
    check: (output) => {
      return (
        output.includes("CANVAS still 300 40 #123456") &&
        output.includes("CANVAS still 300 40 #654321") &&
        (output.match(/CANVAS moving/g) ?? []).length > 5 &&
        output.includes("Canvas draw failed") &&
        output.includes("SIZE sized 300")
      )
    },
  },
  {
    name: "shader",
    check: (output) => {
      return (
        output.includes("SIZE wave 300") &&
        output.includes("SIZE pane 80") &&
        !output.includes("Shader uniform") &&
        !output.includes("Cannot assign")
      )
    },
  },
  {
    name: "arrange",
    serial: true,
    check: (output) => {
      const glide = (output.match(/ARRANGE glide (\d+)/g) ?? []).map((line) => Number(line.split(" ")[2]))
      const between = glide.filter((value) => value > 5 && value < 95).length

      return (
        output.includes("SIZE placed 40") &&
        between >= 3 &&
        glide.at(-1) === 100 &&
        output.includes("Arrange failed") &&
        (output.match(/ARRANGE still/g) ?? []).length < 20
      )
    },
  },
  {
    name: "nested-list",
    check: (output) => output.includes("LIST page 120") && output.includes("LIST column 300"),
  },
  {
    name: "packing",
    check: (output) => {
      return output.includes("SIZE wide 40") && output.includes("SIZE hug 40") && output.includes("SIZE grow 100")
    },
  },
  {
    name: "states",
    check: (output) => {
      return (
        output.includes("PulsarView state disabled /root/panel") &&
        output.includes("PulsarView state normal /root/panel") &&
        output.includes("SIZE filled 400") &&
        !/(?:PulsarView|nodes\/\w+)\.qml:\d+: (?!TypeError: Cannot (read property 'colorScheme'|call method '(devMode|env)') of null)/.test(
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
    name: "jsx-quickjs-desktop",
    fixture: "jsx",
    quickjsDesktop: true,
    check: (output) => output.includes("PulsarView built 1") && output.includes("JSX_OK 2"),
  },
  {
    name: "late-window",
    desktop: true,
    check: (output) => output.includes("PulsarView built 1 +2") && output.includes("PulsarView patch 1 +1"),
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
    name: "crypto",
    env: { LANG: "ru_RU.UTF-8", LC_ALL: "ru_RU.UTF-8" },
    check: (output) => cryptoWorks(output),
  },
  {
    name: "crypto-desktop",
    fixture: "crypto",
    desktop: true,
    env: { LANG: "ru_RU.UTF-8", LC_ALL: "ru_RU.UTF-8" },
    check: (output) => cryptoWorks(output),
  },
  {
    name: "late-catch",
    check: (output) => output.includes("LATE_CATCH_HANDLED") && !output.includes("ERROR OVERLAY"),
  },
]

const buildHost = () => {
  if (override) return existsSync(override)

  if (prebuilt()) return existsSync(binary)

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
  const entry = fixtureOf(scenario.fixture ?? scenario.name)

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
  writeFileSync(join(dir, "main.ts"), `import ${JSON.stringify(fixtureOf(scenario.fixture ?? scenario.name))}\n`)
  writeFileSync(join(dir, "pulsar.json"), JSON.stringify(manifest))
}

type Outcome = {
  name: string
  passed: boolean
  report: string
  ms: number
}

const runScenario = async (scenario: Scenario): Promise<Outcome> => {
  const started = Date.now()

  if ((scenario.desktop || scenario.quickjsDesktop) && override)
    return { name: scenario.name, passed: true, report: "", ms: 0 }

  const dir = mkdtempSync(join(tmpdir(), "pulsar-regression-"))

  for (const [name, text] of Object.entries(scenario.files ?? {})) writeFileSync(join(dir, name), text)
  const hostLog = join(dir, "host.log")

  try {
    if (scenario.desktop) prepareDesktop(scenario, dir)
    else await bundle(scenario, dir)

    const run = Bun.spawn({
      cmd: [scenario.desktop || scenario.quickjsDesktop ? desktopBinary : binary],
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
        ...(scenario.quickjsDesktop ? { PULSAR_QUICKJS_BUNDLE: join(dir, "runtime.js") } : {}),
        QT_LOG_FILE: hostLog,
        XDG_DATA_HOME: join(dir, "data"),
        XDG_CONFIG_HOME: join(dir, "config"),
        XDG_CACHE_HOME: join(dir, "cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    // A host that hangs on shutdown must fail the scenario, not stall the run.
    let timedOut = false
    const limit = Number(scenario.env?.AUTO_QUIT_MS ?? 1500) + 20000
    const timer = setTimeout(() => {
      timedOut = true
      run.kill("SIGKILL")
    }, limit)

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
      run.exited,
    ])
    clearTimeout(timer)

    const hostOutput = existsSync(hostLog) ? readFileSync(hostLog, "utf8") : ""
    const output = `${stdout}\n${stderr}\n${hostOutput}${timedOut ? `\nhost hung: killed after ${limit} ms\n` : ""}`
    const passed =
      !timedOut &&
      exitCode === 0 &&
      scenario.check(output) &&
      !output.includes("recursive rearrange") &&
      !output.includes("read-only property") &&
      !output.includes("as the root of a QML document")

    const head = `${passed ? "ok  " : "FAIL"} ${scenario.name} (exit ${exitCode}, ${Date.now() - started} ms)`

    return { name: scenario.name, passed, report: passed ? head : `${head}\n${output}`, ms: Date.now() - started }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (!buildHost()) {
  void server.stop(true)
  console.error("embedded-regressions: qml-host-qjs is not built")
  process.exit(1)
}

const selected = scenarios.filter((scenario) => !only || scenario.name === only)
const jobs = testJobs()

const run = async (scenario: Scenario) => {
  const outcome = await runScenario(scenario)

  if (outcome.report) console.log(outcome.report)

  return outcome
}

const outcomes: Outcome[] = []

if (jobs === 1) {
  // The old behaviour: every scenario in order, one at a time.
  for (const scenario of selected) outcomes.push(await run(scenario))
}

if (jobs > 1) {
  const parallel = selected.filter((scenario) => !scenario.serial)
  const serial = selected.filter((scenario) => scenario.serial)

  // Timing-sensitive scenarios run one at a time in their own lane, never next to each other.
  // The lane plus the pool stay within `jobs` hosts, so the machine is never saturated.
  const lane = async () => {
    const done: Outcome[] = []

    for (const scenario of serial) done.push(await run(scenario))

    return done
  }

  const pool = runPool(
    parallel.map((scenario) => () => run(scenario)),
    jobs - 1,
  )

  const [laneOutcomes, poolOutcomes] = await Promise.all([lane(), pool])

  outcomes.push(...poolOutcomes, ...laneOutcomes)
}

void server.stop(true)

const failed = outcomes.filter((outcome) => !outcome.passed)

if (failed.length > 0) {
  console.error(`embedded-regressions: ${failed.length} FAILED (${failed.map((outcome) => outcome.name).join(", ")})`)
  process.exit(1)
}

console.log(`embedded-regressions: OK (${outcomes.length} scenarios, jobs ${jobs})`)
