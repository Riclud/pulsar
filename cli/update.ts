import { spawnSync } from "child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { REPO, cliVersion, platformId, pulsarHome, releaseUrl } from "./core.ts"

async function latestVersion(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "pulsar-cli" },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`)
  const json = (await res.json()) as { tag_name?: string }
  return (json.tag_name ?? "").replace(/^v/, "")
}

/** Update the CLI distribution to the latest GitHub release. */
export async function update(): Promise<void> {
  const current = cliVersion()
  let latest: string
  try {
    latest = await latestVersion()
  } catch (e) {
    console.error(`pulsar update: could not check the latest release (${e instanceof Error ? e.message : e})`)
    process.exit(1)
  }
  if (!latest) {
    console.error("pulsar update: no releases found")
    process.exit(1)
  }
  if (latest === current) {
    console.log(`pulsar: already up to date (${current})`)
    return
  }

  console.log(`pulsar: updating ${current} -> ${latest}`)
  const asset = `pulsar-cli-${platformId()}.tar.gz`
  const dest = join(pulsarHome(), "versions", latest)
  const tmp = mkdtempSync(join(tmpdir(), "pulsar-update-"))
  try {
    const res = await fetch(releaseUrl(`v${latest}`, asset))
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${asset}`)
    const archive = join(tmp, asset)
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()))

    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    const tar = spawnSync("tar", ["-xzf", archive, "-C", dest], { stdio: "inherit" })
    if (tar.status !== 0) throw new Error("failed to extract CLI archive")

    const link = join(pulsarHome(), "current")
    rmSync(link, { recursive: true, force: true })
    symlinkSync(join("versions", latest), link, "dir")

    console.log(`pulsar: updated to ${latest}`)
    console.log(`  run \`pulsar install\` to fetch the matching toolchain`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
