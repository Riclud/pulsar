import { spawnSync } from "child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import { REPO, cliVersion, fileSha256, flag, linkSdk, platformId, pulsarHome, releaseUrl } from "./core.ts"

const latestVersion = async (): Promise<string> => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "pulsar-cli" },
  })

  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`)

  const json = (await res.json()) as { tag_name?: string }

  return (json.tag_name ?? "").replace(/^v/, "")
}

const download = async (url: string, dest: string): Promise<void> => {
  const res = await fetch(url)

  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)

  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

const verifyChecksum = async (tag: string, asset: string, archive: string): Promise<void> => {
  try {
    const sumsPath = join(dirname(archive), "SHA256SUMS")

    await download(releaseUrl(tag, "SHA256SUMS"), sumsPath)

    const line = readFileSync(sumsPath, "utf8")
      .split("\n")
      .find((entry) => entry.includes(asset))
    const expected = line?.trim().split(/\s+/)[0]

    if (expected && fileSha256(archive) !== expected) throw new Error("checksum mismatch")
  } catch (e) {
    if (e instanceof Error && e.message === "checksum mismatch") throw e
    console.warn("pulsar: could not verify checksum (SHA256SUMS not available)")
  }
}

const relinkApp = (): boolean => {
  const appDir = process.cwd()

  if (!existsSync(join(appDir, "pulsar.json"))) return false

  const sdk = join(pulsarHome(), "current", "core", "sdk")

  if (!existsSync(sdk)) return false

  linkSdk(appDir, sdk)

  return true
}

/** Update the CLI distribution to the latest GitHub release (or --version). */
export const update = async (args: string[] = []): Promise<void> => {
  const requested = flag(args, "--version")

  let latest: string

  if (requested && requested !== "latest") {
    latest = requested.replace(/^v/, "")
  } else {
    try {
      latest = await latestVersion()
    } catch (e) {
      console.error(`pulsar update: could not check the latest release (${e instanceof Error ? e.message : e})`)
      process.exit(1)
    }
  }

  if (!latest) {
    console.error("pulsar update: no releases found")
    process.exit(1)
  }

  const current = cliVersion()

  if (latest === current) {
    const linked = relinkApp()

    console.log(`pulsar: already up to date (${current})`)
    if (linked) console.log("  relinked node_modules/pulsar")
    return
  }

  console.log(`pulsar: updating ${current} -> ${latest}`)

  const tag = `v${latest}`
  const asset = `pulsar-cli-${platformId()}.tar.gz`
  const dest = join(pulsarHome(), "versions", latest)
  const tmp = mkdtempSync(join(tmpdir(), "pulsar-update-"))

  try {
    const archive = join(tmp, asset)

    await download(releaseUrl(tag, asset), archive)
    await verifyChecksum(tag, asset, archive)

    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })

    const tar = spawnSync("tar", ["-xzf", archive, "-C", dest], { stdio: "inherit" })

    if (tar.status !== 0) throw new Error("failed to extract CLI archive")

    const link = join(pulsarHome(), "current")

    rmSync(link, { recursive: true, force: true })
    symlinkSync(join("versions", latest), link, "dir")

    const linked = relinkApp()

    console.log(`pulsar: updated to ${latest}`)
    if (linked) console.log("  relinked node_modules/pulsar")
    console.log(`  run \`pulsar install\` to fetch the matching toolchain`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
