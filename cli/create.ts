import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { basename, join, relative, resolve } from "path"
import { cliVersion, flag, installDependencies, linkSdk, pulsarRoot } from "./core.ts"
import { ui } from "./ui.ts"

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".json", ".qml", ".md", ".txt", ".html", ".css", ".yml", ".yaml"])

const isTextFile = (name: string): boolean => {
  if (name.startsWith(".")) return true

  const dot = name.lastIndexOf(".")

  return dot >= 0 && TEXT_EXT.has(name.slice(dot))
}

const copyTemplate = (srcDir: string, dstDir: string, vars: Record<string, string>): void => {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name)
    const dst = join(dstDir, entry.name)

    if (entry.isDirectory()) {
      mkdirSync(dst, { recursive: true })
      copyTemplate(src, dst, vars)
      continue
    }

    if (!entry.isFile()) continue

    if (!isTextFile(entry.name)) {
      cpSync(src, dst)
      continue
    }

    let text = readFileSync(src, "utf8")

    for (const [key, value] of Object.entries(vars)) text = text.split(key).join(value)

    writeFileSync(dst, text)
  }
}

const listTemplates = (dir: string): string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

export interface AppIdentity {
  target: string
  name: string
  id: string
  title: string
}

/** Names the app after its folder, so `create .` and `create ../app` do not write "." as the name. */
export const identityFor = (name: string, dir: string): AppIdentity => {
  const target = resolve(dir, name)
  const folder = basename(target)
  const slug = folder
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

  return {
    target,
    name: folder,
    id: `com.example.${slug || "app"}`,
    title: folder.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }
}

export const create = (args: string[]): void => {
  const name = args.find((a) => !a.startsWith("-"))

  if (!name) {
    console.error(
      "pulsar create: missing app name\n  pulsar create <name> [--template default|js|qml|windows|tray] [--dir <path>]",
    )
    process.exit(1)
  }

  const template = flag(args, "--template") ?? "default"
  const templateName = template === "js" ? "default" : template
  const templatesDir = join(pulsarRoot(), "cli", "templates")
  const templateDir = join(templatesDir, templateName)

  if (!existsSync(templateDir)) {
    ui.error(`unknown template "${template}" (have: ${listTemplates(templatesDir).join(", ")})`)
    process.exit(1)
  }

  const identity = identityFor(name, flag(args, "--dir") ?? ".")
  const { target } = identity

  if (existsSync(target) && readdirSync(target).length > 0 && !args.includes("--force")) {
    ui.error(`${target} already exists (use --force)`)
    process.exit(1)
  }

  mkdirSync(target, { recursive: true })

  copyTemplate(templateDir, target, { "{{name}}": identity.name, "{{id}}": identity.id, "{{title}}": identity.title })

  // Install, then link the local SDK. Order matters: an install may prune node_modules.
  installDependencies(target, true)
  linkSdk(target)

  ui.banner(cliVersion())
  ui.done(`created ${ui.code(relative(process.cwd(), target) || ".")} from the ${template} template`)
  ui.note("next:")
  console.log(`    ${ui.code(`cd ${relative(process.cwd(), target) || "."}`)}`)
  console.log(`    ${ui.code("pulsar dev")}`)
  console.log("")
}
