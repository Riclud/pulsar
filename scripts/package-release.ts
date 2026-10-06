#!/usr/bin/env bun
// Build the release assets uploaded by .github/workflows/release.yml:
//   dist/pulsar-cli-<platform>.tar.gz              (CLI distribution: cli/ + core/)
//   dist/pulsar-toolchain-<platform>.tar.gz        (host + bridge + launcher + Qt)
//   dist/pulsar-toolchain-slim-<platform>.tar.gz   (no Qt)
//   dist/SHA256SUMS
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { platformId } from "../cli/core.ts"
import { qtConfText, qtFiles } from "../cli/qt.ts"

const root = resolve(import.meta.dir, "..")
const out = join(root, "dist")
const platform = platformId()
const exe = process.platform === "win32" ? ".exe" : ""

function tar(name: string, cwd: string, paths: string[]): string {
  const dest = join(out, name)
  const r = spawnSync("tar", ["-czf", dest, ...paths], { cwd, stdio: "inherit" })
  if (r.status !== 0) throw new Error(`tar failed for ${name}`)
  return dest
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// --- CLI distribution ---
tar(`pulsar-cli-${platform}.tar.gz`, root, ["cli", "core"])

// --- Toolchain ---
const qmlHost = join(root, "zig-out", "bin", `qml-host${exe}`)
const bridge = join(root, "zig-out", "bin", `bridge${exe}`)
const launcher = join(root, "zig-out", "bin", `launcher${exe}`)
for (const bin of [qmlHost, bridge, launcher]) {
  if (!existsSync(bin)) throw new Error(`missing build artifact: ${bin} (run zig build first)`)
}

function stageToolchain(withQt: boolean, name: string): string {
  const stage = join(out, `.stage-${withQt ? "fat" : "slim"}`)
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(join(stage, "bin"), { recursive: true })
  cpSync(qmlHost, join(stage, "bin", `qml-host${exe}`))
  cpSync(bridge, join(stage, "bin", `bridge${exe}`))
  cpSync(launcher, join(stage, "bin", `launcher${exe}`))

  if (withQt) {
    const files = qtFiles(qmlHost)
    if (!files) throw new Error("Qt not found (qmake); cannot build a fat toolchain")
    for (const file of files) {
      const dest = join(stage, file.rel)
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(file.src, dest)
    }
    writeFileSync(join(stage, "bin", "qt.conf"), qtConfText())
  }
  return tar(name, stage, ["."])
}

stageToolchain(true, `pulsar-toolchain-${platform}.tar.gz`)
stageToolchain(false, `pulsar-toolchain-slim-${platform}.tar.gz`)

// --- Checksums ---
const lines: string[] = []
for (const name of readdirSync(out)) {
  if (name === "SHA256SUMS" || name.startsWith(".stage")) continue
  const hash = createHash("sha256")
    .update(readFileSync(join(out, name)))
    .digest("hex")
  lines.push(`${hash}  ${name}`)
}
writeFileSync(join(out, "SHA256SUMS"), lines.join("\n") + "\n")

rmSync(join(out, ".stage-fat"), { recursive: true, force: true })
rmSync(join(out, ".stage-slim"), { recursive: true, force: true })
console.log(`packaged ${platform} -> ${out}`)
