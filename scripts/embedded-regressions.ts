#!/usr/bin/env bun
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { bundleRuntime } from "../cli/android.ts"
import { startDrive, type DriveStep } from "./lib/devdrive.ts"
import { edgeProblem, inertiaProblem } from "./lib/inertia-checks.ts"
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
  /** Files copied into the app folder: name to a path under tests/embedded/regressions. */
  copies?: Record<string, string>
  /** Run the desktop host with the bundle on its in-process QuickJS runtime. */
  quickjsDesktop?: boolean
  env?: Record<string, string>
  /** Real pointer input sent through the dev channel, with the time each step is sent. */
  drive?: DriveStep[]
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
    name: "qml-no-emit",
    env: { AUTO_QUIT_MS: "1200" },
    files: {
      "probe.qml": [
        "import QtQuick",
        "Item {",
        "    property int step: 0",
        '    onStepChanged: console.log("QML_PROBE step " + step)',
        "}",
      ].join("\n"),
    },
    check: (output) => output.includes("QML_PROBE step 2") && !output.includes("pulsarEmit"),
  },
  {
    name: "qml-release",
    env: { AUTO_QUIT_MS: "1800" },
    files: {
      "probe.qml": [
        "import QtQuick",
        "Item {",
        '    property string name: ""',
        '    Component.onDestruction: console.log("QML_PROBE destroyed " + name)',
        "    // Looks like a MediaPlayer to the host.",
        "    QtObject {",
        "        id: player",
        "        property int playbackState: 1",
        '        property url source: "file:///tmp/none.mp4"',
        "        function stop() {",
        '            console.log("QML_PROBE stop " + name)',
        "        }",
        "    }",
        "}",
      ].join("\n"),
    },
    check: (output) => {
      const lines = output.split("\n")
      const at = (text: string) => lines.findIndex((line) => line.includes(text))

      // p0 is replaced by p1 (new key), p1 is removed.
      return at("stop p0") > 0 && at("stop p1") > 0
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
    name: "keyed-patches",
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "2400" },
    check: (output) => {
      return (
        output.includes("ORDER 0 list abc shell abc") &&
        output.includes("ORDER 1 list xabc shell xabc") &&
        output.includes("ORDER 2 list xac shell xac") &&
        output.includes("ORDER 3 list cxa shell cxa") &&
        output.includes("ORDER 4 list cxay shell cxay") &&
        !output.includes("child patch for an unknown node")
      )
    },
  },
  {
    name: "keyed-patches-large",
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "1800" },
    check: (output) => {
      const edits = output.split("\n").filter((line) => line.includes("PulsarView patch"))
      const updated = edits.map((line) => Number(/ ~(\d+) /.exec(line)?.[1] ?? Infinity))

      // Four edits of a 900-node list: only the edited rows and the list itself may be touched.
      return edits.length === 4 && updated.every((count) => count <= 4)
    },
  },
  {
    name: "icons",
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "1500" },
    check: (output) => {
      // The badged icon is not native, so only four glyphs log. Each logs again when the theme changes.
      const lines = output.split("\n")

      const last = (name: string) => {
        return lines.filter((line) => line.includes(`PulsarView icon /root/row/${name} `)).at(-1)
      }

      const first = lines.find((line) => line.includes("PulsarView icon /root/row/plain "))

      return (
        first?.includes("family=Material Icons px=24") === true &&
        last("plain")?.endsWith("family=Test Icons px=36 color=#ff112233") === true &&
        last("sized")?.endsWith("family=Test Icons px=48 color=#ff112233") === true &&
        last("themed")?.endsWith("family=Test Icons px=36 color=#336699") === true &&
        last("literal")?.endsWith("family=Test Icons px=36 color=#ff0000") === true &&
        last("badged") === undefined
      )
    },
  },
  {
    name: "box-states",
    quickjsDesktop: true,
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "2800" },
    drive: [
      { at: 700, cmd: { cmd: "pointer", action: "hover", x: 50, y: 20 } },
      { at: 1000, cmd: { cmd: "pointer", action: "hover", x: 50, y: 70 } },
      { at: 1300, cmd: { cmd: "pointer", action: "press", x: 50, y: 70 } },
      { at: 1600, cmd: { cmd: "pointer", action: "release", x: 50, y: 70 } },
      { at: 1900, cmd: { cmd: "pointer", action: "leave" } },
    ],
    check: (output) => {
      const states = (path: string) => {
        return output
          .split("\n")
          .filter((line) => line.includes(`PulsarView state `) && line.includes(` ${path} `))
          .map((line) => line.replace(/^.*PulsarView state /, ""))
      }

      return (
        states("/root/a").join("|") ===
          "normal /root/a color=#222222 border=#ffacb0be ms=40|hover /root/a color=#333333 border=#ffacb0be ms=40|normal /root/a color=#222222 border=#ffacb0be ms=40" &&
        states("/root/b").join("|") ===
          "normal /root/b color=#444444 border=#ffacb0be ms=120|hover /root/b color=#555555 border=#ffacb0be ms=120|pressed /root/b color=#666666 border=#777777 ms=120|hover /root/b color=#555555 border=#ffacb0be ms=120|normal /root/b color=#444444 border=#ffacb0be ms=120" &&
        states("/root/c").join("|") ===
          "disabled /root/c color=#888888 border=#aaaaaa ms=120|normal /root/c color=#999999 border=#ffacb0be ms=120" &&
        output.includes("PulsarView pointer /root/b tap=1 hand=1") &&
        output.includes("PulsarView pointer /root/a tap=0 hand=1") &&
        output.includes("PulsarView pointer /root/c tap=0 hand=0") &&
        output.includes("CLICK b")
      )
    },
  },
  {
    name: "box-scroll-hover",
    quickjsDesktop: true,
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "3000" },
    drive: [
      { at: 600, cmd: { cmd: "pointer", action: "hover", x: 50, y: 20 } },
      { at: 900, cmd: { cmd: "wheel", dy: 120, x: 50, y: 20 } },
      { at: 950, cmd: { cmd: "wheel", dy: 120, x: 50, y: 20 } },
      { at: 1000, cmd: { cmd: "wheel", dy: 120, x: 50, y: 20 } },
    ],
    check: (output) => {
      const hovers = output.split("\n").filter((line) => line.includes("PulsarView state hover "))

      // Hover is off while the list scrolls: the first row loses it once, and the row that ends up
      // under the pointer gets it back after the scroll. Without that every row passing by flashes.
      return (
        hovers.length === 2 && /\/root\/list\/r0( |$)/.test(hovers[0]!) && !/\/root\/list\/r0( |$)/.test(hovers[1]!)
      )
    },
  },
  {
    name: "box-scroll-hover-native",
    quickjsDesktop: true,
    fixture: "box-scroll-hover-native",
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "3000" },
    drive: [
      { at: 600, cmd: { cmd: "pointer", action: "hover", x: 50, y: 20 } },
      { at: 900, cmd: { cmd: "wheel", dy: 120, x: 50, y: 20 } },
      { at: 950, cmd: { cmd: "wheel", dy: 120, x: 50, y: 20 } },
      { at: 1000, cmd: { cmd: "wheel", dy: 120, x: 50, y: 20 } },
    ],
    check: (output) => {
      const hovers = output.split("\n").filter((line) => line.includes("PulsarView state hover "))

      // Hover is off while the list scrolls: the first row loses it once, and the row that ends up
      // under the pointer gets it back after the scroll. Without that every row passing by flashes.
      return (
        hovers.length === 2 && /\/root\/list\/r0( |$)/.test(hovers[0]!) && !/\/root\/list\/r0( |$)/.test(hovers[1]!)
      )
    },
  },
  {
    name: "card-native",
    quickjsDesktop: true,
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "1500" },
    check: (output) => {
      // Default padding 16 and the theme radius, then explicit padding, radius and colour.
      return (
        output.includes("SIZE plain 288 18") &&
        output.includes("SIZE tight 312 18") &&
        output.includes("PulsarView card /root/plain color=#ffccd0da radius=17 padding=16") &&
        output.includes("PulsarView card /root/tight color=#ff123456 radius=3 padding=4")
      )
    },
  },
  {
    name: "inertia",
    serial: true,
    quickjsDesktop: true,
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "9000" },
    drive: [
      {
        at: 1200,
        cmd: {
          cmd: "perf",
          steps: [
            { do: "hover", x: 100, y: 120 },
            { do: "wheel", x: 100, y: 120, ticks: 1, dy: 120 },
            { do: "wait", ms: 700 },
            { do: "wheel", x: 100, y: 120, ticks: 1, dy: 120, pixel: true },
            { do: "wait", ms: 700 },
            { do: "drag", x: 100, y: 200, dx: 0, dy: -150, ms: 120 },
            { do: "wait", ms: 1500 },
            { do: "wheel", x: 100, y: 120, ticks: 6, every: 30, dy: 120 },
            { do: "wait", ms: 40 },
            { do: "tap", x: 100, y: 120, hold: 60 },
            { do: "wait", ms: 500 },
          ],
        },
      },
    ],
    check: (output) => {
      const problem = inertiaProblem(output)

      if (problem) console.error(`inertia: ${problem}`)

      return problem === undefined
    },
  },
  {
    name: "inertia-edge",
    serial: true,
    quickjsDesktop: true,
    env: { PULSAR_TRANSITION: "none", AUTO_QUIT_MS: "7000" },
    drive: [
      {
        at: 1200,
        cmd: {
          cmd: "perf",
          steps: [
            { do: "hover", x: 100, y: 120 },
            { do: "wheel", x: 100, y: 120, ticks: 1, dy: 120 },
            { do: "wait", ms: 700 },
            { do: "drag", x: 100, y: 220, dx: 0, dy: -150, ms: 100 },
            { do: "wait", ms: 1500 },
          ],
        },
      },
    ],
    check: (output) => {
      const problem = edgeProblem(output)

      if (problem) console.error(`inertia-edge: ${problem}`)

      return problem === undefined
    },
  },
  {
    name: "nested-list",
    check: (output) => output.includes("LIST page 120") && output.includes("LIST column 300"),
  },
  {
    name: "stack-centre",
    check: (output) => {
      return (
        output.includes("BOX after 100 20 10 10") &&
        output.includes("BOX small 40 15 20 20") &&
        output.includes("BOX dot 140 90 20 20")
      )
    },
  },
  {
    name: "tabs-column",
    check: (output) => {
      const tabs = output
        .match(/TABS tabs (\d+) (\d+)/g)
        ?.at(-1)
        ?.split(" ")
      const footer = output
        .match(/TABS footer (\d+) (\d+)/g)
        ?.at(-1)
        ?.split(" ")

      if (!tabs || !footer) return false

      const [tabsY, tabsHeight, footerY] = [Number(tabs[2]), Number(tabs[3]), Number(footer[2])]

      // The bar plus one 60 px page, not the rest of the column.
      return tabsHeight >= 100 && tabsHeight < 160 && footerY === tabsY + tabsHeight
    },
  },
  {
    name: "box-fill",
    desktop: true,
    check: (output) => {
      return (
        output.includes("FILL box 200 10") &&
        output.includes("FILL card 208 10") &&
        output.includes("FILL column 180 10") &&
        output.includes("FILL hug 0 10")
      )
    },
  },
  {
    name: "scroll-to",
    serial: true,
    env: { AUTO_QUIT_MS: "2800" },
    check: (output) => {
      const moved = output.split("\n").filter((line) => line.includes("PulsarView scrolled"))
      const offsets = output.split("\n").filter((line) => line.includes("] SCROLL "))

      return (
        moved.some((line) => line.endsWith("scrolled 200")) &&
        moved.some((line) => line.endsWith("scrolled 250")) &&
        moved.some((line) => line.endsWith("scrolled 300")) &&
        moved.some((line) => line.endsWith("scrolled 310")) &&
        // The native scroll goes to the end, 40 rows of 20 px in a 300 px window.
        moved.some((line) => line.endsWith("scrolled 500")) &&
        offsets.some((line) => line.endsWith("SCROLL 250")) &&
        offsets.some((line) => line.endsWith("SCROLL 310")) &&
        offsets.at(-1)?.endsWith("SCROLL 0") === true
      )
    },
  },
  {
    name: "scroll-to-desktop",
    serial: true,
    fixture: "scroll-to",
    desktop: true,
    env: { AUTO_QUIT_MS: "2800" },
    check: (output) => {
      const moved = output.split("\n").filter((line) => line.includes("PulsarView scrolled"))
      const offsets = output.split("\n").filter((line) => line.includes("] SCROLL "))

      return (
        moved.some((line) => line.endsWith("scrolled 200")) &&
        moved.some((line) => line.endsWith("scrolled 250")) &&
        moved.some((line) => line.endsWith("scrolled 300")) &&
        moved.some((line) => line.endsWith("scrolled 310")) &&
        // The native scroll goes to the end, 40 rows of 20 px in a 300 px window.
        moved.some((line) => line.endsWith("scrolled 500")) &&
        offsets.some((line) => line.endsWith("SCROLL 250")) &&
        offsets.some((line) => line.endsWith("SCROLL 310")) &&
        offsets.at(-1)?.endsWith("SCROLL 0") === true
      )
    },
  },
  {
    name: "virtual-rows",
    serial: true,
    env: { AUTO_QUIT_MS: "2200" },
    check: (output) => {
      const first = output.match(/FIRST rendered=(\d+) highest=(\d+)/)
      const far = output.match(/FAR rendered=(\d+) lowest=(\d+) highest=(\d+)/)

      if (!first || !far) return false

      const [rendered, highest] = [Number(first[1]), Number(first[2])]
      const [moved, lowest, top] = [Number(far[1]), Number(far[2]), Number(far[3])]

      // 1000 rows exist, only a window of them is ever drawn: first the top, then around row 500.
      return rendered < 80 && highest < 80 && moved > 0 && moved < 80 && lowest >= 480 && top >= 505 && top < 540
    },
  },
  {
    name: "visibility",
    serial: true,
    env: { AUTO_QUIT_MS: "2000" },
    check: (output) => {
      const count = (text: string) => output.split("\n").filter((line) => line.endsWith(text)).length
      const rows = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => from + index)

      return (
        // 30 px rows in 300 px: rows 0 to 9 are on the first screen, row 10 is not.
        rows(0, 10).every((row) => count(`ENTER ${row}`) === 1 && count(`VISIBLE ${row} true`) === 1) &&
        rows(10, 20).every((row) => count(`ENTER ${row}`) === 0) &&
        // The scroll to 600 px shows rows 20 to 29 and hides the first ten.
        rows(20, 30).every((row) => count(`ENTER ${row}`) === 1) &&
        rows(0, 10).every((row) => count(`LEAVE ${row}`) === 1 && count(`VISIBLE ${row} false`) === 1) &&
        count("ENTER 40") === 0 &&
        count("LEAVE 25") === 0
      )
    },
  },
  {
    name: "video",
    serial: true,
    env: { AUTO_QUIT_MS: "3600" },
    copies: { "clip.webm": "assets/clip.webm" },
    check: (output) => {
      const lines = output.split("\n")
      const last = (text: string) => lines.reduce((found, line, index) => (line.includes(text) ? index : found), -1)
      const released = last("video released")

      return (
        output.includes("VIDEO ended") &&
        // The looping player is stopped while it plays, when its node leaves.
        output.includes("video released while playing") &&
        last("video state 1") > 0 &&
        // Nothing starts playing again after the last node is gone.
        last("video state 1") < released
      )
    },
  },
  {
    name: "video-paused",
    serial: true,
    env: { AUTO_QUIT_MS: "2800" },
    copies: { "clip.webm": "assets/clip.webm" },
    check: (output) => {
      const lines = output.split("\n")
      const at = (text: string) => lines.findIndex((line) => line.includes(text))
      const first = at("video state 1")

      // Loaded but held back while paused, and it plays once paused turns false.
      return (
        at("video status 2") > 0 && at("PHASE paused") > 0 && first > at("PHASE paused") && first < at("PHASE playing")
      )
    },
  },
  {
    name: "video-desktop",
    fixture: "video",
    desktop: true,
    serial: true,
    env: { AUTO_QUIT_MS: "3600" },
    copies: { "clip.webm": "assets/clip.webm" },
    check: (output) => output.includes("VIDEO ended") && output.includes("video released while playing"),
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
  for (const [name, source] of Object.entries(scenario.copies ?? {}))
    copyFileSync(join(fixtures, source), join(dir, name))
  const hostLog = join(dir, "host.log")
  const drive = scenario.drive ? startDrive(scenario.drive) : undefined

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
        ...(drive ? { PULSAR_DEV_URL: drive.url } : {}),
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
    const driven = drive ? `\nDRIVE ${JSON.stringify(drive.replies)}\n` : ""
    const output = `${stdout}\n${stderr}\n${hostOutput}${driven}${timedOut ? `\nhost hung: killed after ${limit} ms\n` : ""}`
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
    drive?.stop()
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
