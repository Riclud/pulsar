#!/usr/bin/env bun
// Build the release assets uploaded by .github/workflows/release.yml:
//   dist/pulsar-cli-<platform>.tar.gz              (CLI distribution: cli/ + core/)
//   dist/pulsar-toolchain-<platform>.tar.gz        (host + bridge + launcher + Qt)
//   dist/pulsar-toolchain-slim-<platform>.tar.gz   (no Qt)
//   dist/SHA256SUMS
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import { dirname, join, relative, resolve, sep } from "path"
import { platformId } from "../cli/core.ts"
import { qtConfText, qtFiles, qtTools } from "../cli/qt.ts"

const root = resolve(import.meta.dir, "..")
const out = join(root, "dist")
const platform = platformId()
const exe = process.platform === "win32" ? ".exe" : ""

const tar = (name: string, cwd: string, paths: string[]): string => {
  const dest = join(out, name)
  const relDest = relative(cwd, dest).split(sep).join("/")

  const r = spawnSync("tar", ["-czf", relDest, ...paths], { cwd, stdio: "inherit" })

  if (r.status !== 0) throw new Error(`tar failed for ${name}`)

  return dest
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// --- CLI distribution ---
// bin/pulsar is the CLI compiled with Bun inside it, so users need no Bun.
const cliStage = join(out, ".stage-cli")
const cliBinary = join(cliStage, "bin", `pulsar${exe}`)

mkdirSync(dirname(cliBinary), { recursive: true })

const compiled = spawnSync(
  process.execPath,
  ["build", join(root, "cli", "index.ts"), "--compile", "--outfile", cliBinary],
  {
    stdio: "inherit",
  },
)

if (compiled.status !== 0 || !existsSync(cliBinary)) throw new Error("cannot compile the pulsar CLI")

// The runtime takes its JSX settings from the tsconfig.json next to it, so the
// archive ships one that points JSX at the bundled SDK.
if (!readFileSync(join(root, "tsconfig.json"), "utf8").includes('"jsxImportSource": "pulsar"')) {
  throw new Error("tsconfig.json must set jsxImportSource to pulsar")
}

const CLI_PATHS = ["cli", "core", "CMakeLists.txt", "package.json", "tsconfig.json", "host", "bridge", "launcher", "android"]

tar(`pulsar-cli-${platform}.tar.gz`, root, [...CLI_PATHS, "-C", cliStage, "bin"])

// --- Toolchain ---
const qmlHost = join(root, "build", "bin", `qml-host${exe}`)
const bridge = join(root, "build", "bin", `bridge${exe}`)
const launcher = join(root, "build", "bin", `launcher${exe}`)

for (const bin of [qmlHost, bridge, launcher]) {
  if (!existsSync(bin)) throw new Error(`missing build artifact: ${bin} (run the CMake build first)`)
}

const hostQmlImports = (): string[] => {
  const dir = join(root, "host", "qml")
  const imports = new Set<string>()

  const lines = readdirSync(dir)
    .filter((entry) => entry.endsWith(".qml"))
    .flatMap((entry) => readFileSync(join(dir, entry), "utf8").split("\n"))

  for (const line of lines) {
    const match = line.match(/^import\s+(Qt[\w.]*)/)

    if (match?.[1]) imports.add(match[1])
  }

  return [...imports]
}

const validateToolchain = (stage: string): void => {
  const qmlRoots = [join(stage, "lib", "Qt", "qml"), join(stage, "bin", "qml"), join(stage, "qml")]
  const pluginRoots = [join(stage, "lib", "Qt", "plugins"), join(stage, "bin", "plugins"), join(stage, "plugins")]
  const imports = hostQmlImports()
  const hasModule = (name: string) => qmlRoots.some((root) => existsSync(join(root, ...name.split("."))))
  const missing = imports.filter((name) => !hasModule(name))

  if (missing.length > 0) throw new Error(`toolchain is missing QML modules: ${missing.join(", ")}`)

  if (imports.includes("QtMultimedia") && !pluginRoots.some((root) => existsSync(join(root, "multimedia")))) {
    throw new Error("toolchain is missing the multimedia plugins")
  }
}

const checkQsb = (stage: string): void => {
  const qsb = [join(stage, "lib", "Qt", "bin", "qsb"), join(stage, "bin", "qsb.exe")].find((path) => existsSync(path))

  if (!qsb) throw new Error("toolchain is missing qsb")

  const r = spawnSync(qsb, ["--version"], { encoding: "utf8" })

  if (r.status !== 0) throw new Error(`staged qsb does not run: ${r.stderr || r.error}`)
}

const stageToolchain = (withQt: boolean, name: string): string => {
  const stage = join(out, `.stage-${withQt ? "fat" : "slim"}`)

  rmSync(stage, { recursive: true, force: true })
  mkdirSync(join(stage, "bin"), { recursive: true })
  cpSync(qmlHost, join(stage, "bin", `qml-host${exe}`))
  cpSync(bridge, join(stage, "bin", `bridge${exe}`))
  cpSync(launcher, join(stage, "bin", `launcher${exe}`))

  if (withQt) {
    const tools = qtTools(["qsb"])

    if (tools.length === 0) throw new Error("qsb not found next to qmake; install the Qt Shader Tools module")

    const files = qtFiles(qmlHost, tools)

    if (!files) throw new Error("Qt not found (qmake); cannot build a fat toolchain")

    for (const file of files) {
      const dest = join(stage, file.rel)

      mkdirSync(dirname(dest), { recursive: true })
      cpSync(file.src, dest)
    }

    writeFileSync(join(stage, "bin", "qt.conf"), qtConfText())

    validateToolchain(stage)
    checkQsb(stage)
  }

  return tar(name, stage, ["."])
}

stageToolchain(true, `pulsar-toolchain-${platform}.tar.gz`)
stageToolchain(false, `pulsar-toolchain-slim-${platform}.tar.gz`)

// --- Full package: CLI and toolchain in one folder, for system package managers ---
const full = join(out, ".stage-full")

rmSync(full, { recursive: true, force: true })
mkdirSync(full, { recursive: true })

for (const path of [...CLI_PATHS, "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  cpSync(join(root, path), join(full, path), { recursive: true })
}

cpSync(join(cliStage, "bin"), join(full, "bin"), { recursive: true })
cpSync(join(out, ".stage-fat"), full, { recursive: true })

// winget needs a zip. Only the Windows bsdtar writes one; Git Bash puts GNU tar first
// on PATH, and it reads "D:" in a path as a remote host.
if (process.platform === "win32") {
  const bsdtar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
  const dest = relative(full, join(out, `pulsar-${platform}.zip`))

  const zip = spawnSync(bsdtar, ["-a", "-cf", dest, "."], { cwd: full, stdio: "inherit" })

  if (zip.status !== 0) throw new Error("zip failed for the full package")
} else {
  tar(`pulsar-${platform}.tar.gz`, full, ["."])
}

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
rmSync(cliStage, { recursive: true, force: true })
rmSync(full, { recursive: true, force: true })

console.log(`packaged ${platform} -> ${out}`)
