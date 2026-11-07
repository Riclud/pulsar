import { mkdirSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join, resolve } from "path"
import components from "../docs/guide-components.md" with { type: "text" }
import layout from "../docs/guide-ui.md" with { type: "text" }
import recipes from "../skills/pulsar/recipes.md" with { type: "text" }
import reference from "../docs/reference.md" with { type: "text" }
import skill from "../skills/pulsar/SKILL.md" with { type: "text" }

// The files ship inside the CLI, so the skill always matches the installed version.
const FILES: Readonly<Record<string, string>> = {
  "SKILL.md": skill,
  "recipes.md": recipes,
  "reference.md": reference,
  "components.md": components,
  "ui.md": layout,
}

/**
 * Installs the agent skill. `.claude/skills` is read by Claude Code and, for
 * compatibility, by opencode and other agents that support Agent Skills.
 */
export const installSkill = (options: { global: boolean; dir?: string }): string => {
  const base = options.dir ? resolve(options.dir) : join(options.global ? homedir() : process.cwd(), ".claude", "skills")
  const target = join(base, "pulsar")

  mkdirSync(target, { recursive: true })

  for (const [name, text] of Object.entries(FILES)) writeFileSync(join(target, name), text)

  return target
}
