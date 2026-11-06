#!/usr/bin/env bun
// Fills the package manager files in packaging/ for one release:
//   bun scripts/packaging.ts 2.0.1
// writes dist/packaging/{aur,homebrew,scoop,winget} with the version and the
// SHA-256 sums taken from that release's SHA256SUMS.
import { spawnSync } from "child_process"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join, resolve } from "path"

const root = resolve(import.meta.dir, "..")
const version = process.argv[2]

if (!version) {
  console.error("usage: bun scripts/packaging.ts <version>")
  process.exit(1)
}

const sums = await fetch(`https://github.com/riclud/pulsar/releases/download/v${version}/SHA256SUMS`)

if (!sums.ok) {
  console.error(`no SHA256SUMS for v${version} (${sums.status})`)
  process.exit(1)
}

const hashes = new Map(
  (await sums.text())
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 2)
    .map(([hash, name]) => [name!, hash!]),
)

const hashOf = (file: string): string => {
  const hash = hashes.get(file)

  if (!hash) throw new Error(`${file} is not in the release`)

  return hash
}

const values: Record<string, string> = {
  VERSION: version,
  SHA_LINUX_X64: hashOf("pulsar-linux-x64.tar.gz"),
  SHA_LINUX_ARM64: hashOf("pulsar-linux-arm64.tar.gz"),
  SHA_MACOS_ARM64: hashOf("pulsar-macos-arm64.tar.gz"),
  SHA_MACOS_X64: hashOf("pulsar-macos-x64.tar.gz"),
  SHA_WINDOWS_X64: hashOf("pulsar-windows-x64.zip"),
  SHA_WINDOWS_ARM64: hashOf("pulsar-windows-arm64.zip"),
}

values.SHA_WINDOWS_X64_UPPER = values.SHA_WINDOWS_X64!.toUpperCase()
values.SHA_WINDOWS_ARM64_UPPER = values.SHA_WINDOWS_ARM64!.toUpperCase()

const render = (text: string): string => {
  return text.replace(/@([A-Z0-9_]+)@/g, (match, key: string) => values[key] ?? match)
}

for (const manager of readdirSync(join(root, "packaging"))) {
  const out = join(root, "dist", "packaging", manager)

  mkdirSync(out, { recursive: true })

  for (const file of readdirSync(join(root, "packaging", manager))) {
    writeFileSync(join(out, file), render(readFileSync(join(root, "packaging", manager, file), "utf8")))
  }
}

// AUR also needs .SRCINFO, which makepkg writes on Arch.
const srcinfo = spawnSync("makepkg", ["--printsrcinfo"], { cwd: join(root, "dist", "packaging", "aur"), encoding: "utf8" })

if (srcinfo.status === 0) writeFileSync(join(root, "dist", "packaging", "aur", ".SRCINFO"), srcinfo.stdout)
else console.warn("makepkg not found: run `makepkg --printsrcinfo > .SRCINFO` in dist/packaging/aur on Arch")

console.log(`packaging files for v${version} -> dist/packaging`)
