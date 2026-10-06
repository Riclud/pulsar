import { spawnSync } from "child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { join, relative, resolve } from "path"
import { flag, pulsarRoot } from "./core.ts"

const TEXT_EXT = new Set([".ts", ".js", ".json", ".qml", ".md", ".txt", ".html", ".css", ".yml", ".yaml"])

function isTextFile(name: string): boolean {
  if (name.startsWith(".")) return true
  const dot = name.lastIndexOf(".")
  return dot >= 0 && TEXT_EXT.has(name.slice(dot))
}

function copyTemplate(srcDir: string, dstDir: string, vars: Record<string, string>): void {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name)
    const dst = join(dstDir, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(dst, { recursive: true })
      copyTemplate(src, dst, vars)
    } else if (entry.isFile()) {
      if (isTextFile(entry.name)) {
        let text = readFileSync(src, "utf8")
        for (const [key, value] of Object.entries(vars)) text = text.split(key).join(value)
        writeFileSync(dst, text)
      } else {
        cpSync(src, dst)
      }
    }
  }
}

function listTemplates(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

/** Link the bundled SDK so `import { App } from "pulsar"` resolves. */
function linkSdk(target: string): void {
  const sdk = join(pulsarRoot(), "core", "sdk")
  const nodeModules = join(target, "node_modules")
  mkdirSync(nodeModules, { recursive: true })
  const link = join(nodeModules, "pulsar")
  rmSync(link, { recursive: true, force: true })
  try {
    symlinkSync(relative(nodeModules, sdk) || sdk, link, "dir")
  } catch {
    cpSync(sdk, link, { recursive: true })
  }
}

export function create(args: string[]): void {
  const name = args.find((a) => !a.startsWith("-"))
  if (!name) {
    console.error(
      "pulsar create: missing app name\n  pulsar create <name> [--template default|windows|tray] [--dir <path>]",
    )
    process.exit(1)
  }

  const template = flag(args, "--template") ?? "default"
  const templatesDir = join(pulsarRoot(), "cli", "templates")
  const templateDir = join(templatesDir, template)
  if (!existsSync(templateDir)) {
    console.error(`pulsar create: unknown template "${template}" (have: ${listTemplates(templatesDir).join(", ")})`)
    process.exit(1)
  }

  const target = resolve(flag(args, "--dir") ?? ".", name)
  if (existsSync(target) && readdirSync(target).length > 0 && !args.includes("--force")) {
    console.error(`pulsar create: ${target} already exists (use --force)`)
    process.exit(1)
  }
  mkdirSync(target, { recursive: true })

  const slug = name
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
  const id = `com.example.${slug || "app"}`
  const title = name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

  copyTemplate(templateDir, target, { "{{name}}": name, "{{id}}": id, "{{title}}": title })

  // Install (no remote deps yet) then link the local SDK. Order matters:
  // bun install may prune node_modules.
  spawnSync(process.execPath, ["install"], { cwd: target, stdio: "ignore" })
  linkSdk(target)

  console.log(`pulsar: created ${target} (template: ${template})`)
  console.log(`  cd ${relative(process.cwd(), target) || "."} && bun run dev`)
}
