import { spawnSync } from "child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { cliVersion, fileSha256, flag, platformId, pulsarHome, releaseUrl, toolchainDir } from "./core.ts"

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

/**
 * Download the native toolchain (qml-host + bridge, and bundled Qt unless
 * `--slim`) for this platform into the versioned home and point `current` at it.
 */
export async function install(args: string[]): Promise<void> {
  const version = flag(args, "--version") ?? cliVersion()
  const tag = version === "latest" ? "latest" : `v${version}`
  const slim = args.includes("--slim")
  const platform = platformId()
  const asset = `${slim ? "pulsar-toolchain-slim" : "pulsar-toolchain"}-${platform}.tar.gz`
  const dest = toolchainDir(version)

  console.log(`pulsar: installing toolchain for ${platform} (${version}${slim ? ", slim" : ""})`)
  const tmp = mkdtempSync(join(tmpdir(), "pulsar-install-"))
  try {
    const archive = join(tmp, asset)
    await download(releaseUrl(tag, asset), archive)

    // Best-effort integrity check against SHA256SUMS.
    try {
      const sumsPath = join(tmp, "SHA256SUMS")
      await download(releaseUrl(tag, "SHA256SUMS"), sumsPath)
      const line = readFileSync(sumsPath, "utf8")
        .split("\n")
        .find((l) => l.includes(asset))
      const expected = line?.trim().split(/\s+/)[0]
      if (expected && fileSha256(archive) !== expected) throw new Error("checksum mismatch")
    } catch (e) {
      if (e instanceof Error && e.message === "checksum mismatch") throw e
      console.warn("pulsar: could not verify checksum (SHA256SUMS not available)")
    }

    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    const tar = spawnSync("tar", ["-xzf", archive, "-C", dest], { stdio: "inherit" })
    if (tar.status !== 0) throw new Error("failed to extract toolchain archive")

    const link = join(pulsarHome(), "toolchain", "current")
    rmSync(link, { recursive: true, force: true })
    symlinkSync(version, link, "dir")

    console.log(`pulsar: installed toolchain ${version} -> ${dest}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
