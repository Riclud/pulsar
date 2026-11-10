#!/usr/bin/env bun
// Runs the test suites. Builds the host once, then runs independent suites
// concurrently (PULSAR_TEST_JOBS=1 runs them one by one in the old order).
// Usage: bun scripts/test.ts [suite ...]   (no names: every suite)
import { resolve } from "path"
import { runPool, testJobs } from "./lib/pool.ts"
import { suites, type Suite } from "./lib/suites.ts"

type Result = {
  name: string
  passed: boolean
  seconds: number
}

const root = resolve(import.meta.dir, "..")

const buildNative = async (): Promise<boolean> => {
  const steps = [
    ["cmake", "-S", ".", "-B", "build", "-DCMAKE_BUILD_TYPE=Release"],
    ["cmake", "--build", "build", "--target", "all", "qjs-runtime", "qml-host-qjs", "qml-host", "bridge"],
  ]

  for (const cmd of steps) {
    const proc = Bun.spawn({ cmd, cwd: root, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode === 0) continue

    console.error(`${stdout}${stderr}`)

    return false
  }

  return true
}

const runSuite = async (suite: Suite): Promise<Result> => {
  const started = Date.now()

  const proc = Bun.spawn({
    cmd: [...suite.cmd],
    cwd: root,
    env: { ...process.env, PULSAR_TEST_PREBUILT: "1" },
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  const seconds = (Date.now() - started) / 1000
  const passed = exitCode === 0

  // One block per suite, printed when it finishes, so parallel output never interleaves.
  console.log(`${passed ? "ok  " : "FAIL"} ${suite.name} (${seconds.toFixed(1)}s)`)

  if (!passed) console.log(`${stdout}${stderr}`)

  return { name: suite.name, passed, seconds }
}

const wanted = process.argv.slice(2)
const unknown = wanted.filter((name) => !suites.some((suite) => suite.name === name))

if (unknown.length > 0) {
  console.error(`test: unknown suite ${unknown.join(", ")} (known: ${suites.map((suite) => suite.name).join(", ")})`)
  process.exit(2)
}

const selected: readonly Suite[] = suites.filter((suite) => wanted.length === 0 || wanted.includes(suite.name))
const jobs = testJobs()
const started = Date.now()

if (selected.some((suite) => suite.native)) {
  const built = Date.now()

  if (!(await buildNative())) {
    console.error("test: build failed")
    process.exit(1)
  }

  console.log(`ok   build (${((Date.now() - built) / 1000).toFixed(1)}s)`)
}

// With 1 job the order stays as listed; otherwise long suites go first.
const ordered = jobs === 1 ? selected : [...selected].sort((a, b) => Number(b.slow ?? false) - Number(a.slow ?? false))

const results = await runPool(
  ordered.map((suite) => () => runSuite(suite)),
  jobs === 1 ? 1 : Math.max(jobs, ordered.length),
)

const failed = results.filter((result) => !result.passed)

console.log("\nsummary (jobs " + jobs + ")")

for (const suite of selected) {
  const result = results.find((item) => item.name === suite.name)!

  console.log(`  ${result.passed ? "ok  " : "FAIL"} ${result.name.padEnd(14)} ${result.seconds.toFixed(1)}s`)
}

console.log(
  `total ${((Date.now() - started) / 1000).toFixed(1)}s, ${failed.length === 0 ? "all passed" : `${failed.length} FAILED`}`,
)

process.exit(failed.length === 0 ? 0 : 1)
