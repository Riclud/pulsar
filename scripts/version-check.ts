#!/usr/bin/env bun
// Ensures all packages share the same version (lockstep release).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const manifests = ["./package.json", "./core/sdk/package.json", "./cli/package.json"]

function pkg(rel: string): { version?: string } {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8")) as { version?: string }
}

const versions = manifests.map((rel) => pkg(rel).version ?? "missing")
if (new Set(versions).size !== 1) {
  console.error(`version mismatch:\n${manifests.map((m, i) => `  ${m}: ${versions[i]}`).join("\n")}`)
  process.exit(1)
}
console.log(`version OK: ${versions[0]}`)
