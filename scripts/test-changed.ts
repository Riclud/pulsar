#!/usr/bin/env bun
// Runs only the suites relevant to what changed against main: committed on the
// branch, staged, unstaged and untracked files.
//
// Usage: bun scripts/test-changed.ts [--dry-run] [--base <ref>] [--files <path> ...]
//   --dry-run  print the selection and do not run anything
//   --files    use this list instead of git (to try a change set without making it)
//
// Mapping, first matching rule wins (see RULES). Anything that no rule knows
// selects the full suite, because a quick check must never silently skip
// something it cannot judge.
import { resolve } from "path"
import { suites, type SuiteName } from "./lib/suites.ts"

type Rule = {
  /** Why these suites, shown with the selection. */
  why: string
  match: RegExp
  run: readonly SuiteName[]
}

const NATIVE: readonly SuiteName[] = ["embedded", "embedded-qml", "regressions", "error-overlay", "smoke"]

const RULES: readonly Rule[] = [
  {
    why: "docs and metadata: no suite exercises them",
    match: /^(docs|site|skills|\.github)\/|\.md$|^LICENSE$|^THIRD_PARTY/,
    run: [],
  },
  { why: "unit tests only", match: /^(core|cli)\/.*\.test\.tsx?$/, run: ["unit"] },
  {
    why: "SDK code that builds the UI tree: unit, plus the QML renderer checks",
    match: /^core\/sdk\/(ui|jsx|jsx-runtime|jsx-dev-runtime|reactive|nav|theme|themes|responsive)([./]|$)/,
    run: ["unit", "regressions", "embedded-qml"],
  },
  { why: "SDK: unit tests", match: /^core\/sdk\//, run: ["unit"] },
  {
    why: "capabilities: unit, plus QuickJS runtime checks",
    match: /^core\/caps\//,
    run: ["unit", "portable", "embedded"],
  },
  {
    why: "runtime and platform: unit, portable, embedded and the end-to-end smoke",
    match: /^core\/(runtime|platform)(\/|\.ts$)/,
    run: ["unit", "portable", "embedded", "embedded-qml", "smoke"],
  },
  { why: "CLI: unit, plus smoke (it runs `pulsar build`)", match: /^cli\//, run: ["unit", "smoke"] },
  {
    why: "native host and QML: rebuild, then every host suite",
    match: /^(host|bridge|launcher|edge|CMakeLists\.txt)(\/|$)/,
    run: NATIVE,
  },
  { why: "regression fixtures", match: /^tests\/embedded\/regressions\//, run: ["regressions"] },
  { why: "embedded QML fixture", match: /^tests\/embedded\/qml\//, run: ["embedded-qml"] },
  { why: "error overlay fixture", match: /^tests\/embedded\/error\//, run: ["error-overlay"] },
  { why: "embedded fixture", match: /^tests\/embedded\/run\.ts$/, run: ["embedded"] },
  { why: "portable fixture", match: /^tests\/portable\//, run: ["portable"] },
  { why: "smoke fixture apps", match: /^tests\/(apps|qml)\//, run: ["smoke"] },
  { why: "example apps: smoke builds examples/hello", match: /^examples\//, run: ["smoke"] },
  {
    why: "Android, packaging and install scripts: only the CLI unit tests touch them",
    match: /^(android|android-scanner|packaging)\/|^install\.(sh|ps1)$/,
    run: ["unit"],
  },
  { why: "suite script", match: /^scripts\/portable\.ts$/, run: ["portable"] },
  { why: "suite script", match: /^scripts\/embedded\.ts$/, run: ["embedded"] },
  { why: "suite script", match: /^scripts\/embedded-qml\.ts$/, run: ["embedded-qml"] },
  { why: "suite script", match: /^scripts\/embedded-regressions\.ts$/, run: ["regressions"] },
  { why: "suite script", match: /^scripts\/error-overlay\.ts$/, run: ["error-overlay"] },
  { why: "suite script", match: /^scripts\/smoke\.ts$/, run: ["smoke"] },
  {
    why: "formatting and release scripts: not covered by a suite",
    match:
      /^scripts\/(check-recipes|package-android-qt|package-release|packaging|qmlformat|shaders|version-check)\.ts$|^\.prettier|^\.qmlformat|^eslint\.config/,
    run: [],
  },
]

const ALL: readonly SuiteName[] = suites.map((suite) => suite.name)

const root = resolve(import.meta.dir, "..")

const git = (args: readonly string[]): string | null => {
  const proc = Bun.spawnSync({ cmd: ["git", ...args], cwd: root, stdout: "pipe", stderr: "ignore" })

  if (proc.exitCode !== 0) return null

  return proc.stdout.toString()
}

const changedFiles = (base: string): string[] | null => {
  const mergeBase = git(["merge-base", "HEAD", base])?.trim()

  if (!mergeBase) return null

  // Diff against the merge base covers committed, staged and unstaged edits together.
  const tracked = git(["diff", "--name-only", mergeBase])
  const untracked = git(["ls-files", "--others", "--exclude-standard"])

  if (tracked === null || untracked === null) return null

  return [...new Set([...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean))]
}

type Selection = {
  suites: SuiteName[]
  reasons: string[]
}

export const select = (files: readonly string[]): Selection => {
  const picked = new Set<SuiteName>()
  const reasons: string[] = []

  for (const file of files) {
    const rule = RULES.find((item) => item.match.test(file))

    if (!rule) return { suites: [...ALL], reasons: [`${file}: no rule knows this path, running everything`] }

    for (const name of rule.run) picked.add(name)

    reasons.push(`${file}: ${rule.why}${rule.run.length > 0 ? ` -> ${rule.run.join(", ")}` : ""}`)
  }

  return { suites: ALL.filter((name) => picked.has(name)), reasons }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const baseAt = args.indexOf("--base")
  const filesAt = args.indexOf("--files")
  const base = baseAt >= 0 ? (args[baseAt + 1] ?? "main") : "main"

  const files = filesAt >= 0 ? args.slice(filesAt + 1).filter((arg) => !arg.startsWith("--")) : changedFiles(base)

  const selection: Selection = files
    ? select(files)
    : { suites: [...ALL], reasons: [`cannot read changes against ${base}, running everything`] }

  if (files) console.log(`changed against ${filesAt >= 0 ? "the given list" : base}: ${files.length} file(s)`)

  for (const reason of selection.reasons) console.log(`  ${reason}`)

  if (selection.suites.length === 0) {
    console.log("selected: nothing to run")
    process.exit(0)
  }

  console.log(`selected: ${selection.suites.length === ALL.length ? "all suites" : selection.suites.join(", ")}`)

  if (dryRun) process.exit(0)

  const run = Bun.spawn({
    cmd: ["bun", "scripts/test.ts", ...(selection.suites.length === ALL.length ? [] : selection.suites)],
    cwd: root,
    stdio: ["inherit", "inherit", "inherit"],
  })

  process.exit(await run.exited)
}
