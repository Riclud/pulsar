// Startup phases of the desktop host on its QuickJS runtime, on one clock: bun scripts/startup.ts [runs] [app dir]
import { copyFileSync, mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { bundleRuntime } from "../cli/android.ts"

const root = join(import.meta.dir, "..")
const runs = Number(process.argv[2] ?? 10)
const source = process.argv[3] ?? join(root, "tests", "apps", "js-ui")
const app = mkdtempSync(join(tmpdir(), "pulsar-startup-"))
const built = await bundleRuntime(join(source, "main.ts"), app).result

if (!built.success) throw new Error("cannot bundle the app")

writeFileSync(join(app, "runtime.js"), await built.outputs[0]!.text())
copyFileSync(join(source, "pulsar.json"), join(app, "pulsar.json"))

const phases = [
  "main",
  "app",
  "engine",
  "js-start",
  "config",
  "qml-load",
  "qml-compiled",
  "qml-created",
  "ui-built",
  "first-frame",
] as const

const once = async (): Promise<Record<string, number>> => {
  const start = Date.now()
  const proc = Bun.spawn([join(root, "build", "bin", "qml-host")], {
    env: {
      ...process.env,
      PULSAR_DEBUG: "1",
      QT_QPA_PLATFORM: "offscreen",
      QT_QUICK_BACKEND: "software",
      PULSAR_APP: app,
      PULSAR_QUICKJS_BUNDLE: join(app, "runtime.js"),
      XDG_DATA_HOME: join(app, "data"),
      AUTO_QUIT_MS: "1200",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const marks: Record<string, number> = {}
  const record = (line: string) => {
    const match = line.match(/\bST (\S+) (\d+)/)

    if (match && !(match[1]! in marks)) marks[match[1]!] = Number(match[2]) - start
  }
  const scan = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder()

    for await (const chunk of stream) decoder.decode(chunk).split("\n").forEach(record)
  }

  await Promise.all([scan(proc.stdout), scan(proc.stderr), proc.exited])

  return marks
}

const results: Record<string, number>[] = []

for (let i = 0; i < runs; i++) results.push(await once())

const median = (values: number[]) => values.toSorted((a, b) => a - b)[values.length >> 1]!

let previous = 0

for (const phase of phases) {
  const at = results.map((marks) => marks[phase]).filter((value): value is number => value !== undefined)

  if (at.length < runs) {
    console.log(phase.padEnd(14), `missing in ${runs - at.length} runs`)
    continue
  }

  const now = median(at)

  console.log(phase.padEnd(14), `at ${String(now).padStart(5)} ms`, `+${String(now - previous).padStart(4)} ms`)
  previous = now
}
