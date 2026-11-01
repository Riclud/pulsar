import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { AppManifest } from "../core/sdk/manifest.ts"

export const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".cache",
  ".pulsar",
  ".env",
  ".env.*",
  "sync.db",
  "sync.db-*",
]

export interface IgnoreFilter {
  ignored(path: string, isDir?: boolean): boolean
}

interface IgnoreRule {
  regex: RegExp
  negate: boolean
  dirOnly: boolean
}

const escapeRegex = (value: string): string => {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&")
}

const globToRegex = (glob: string): string => {
  let out = ""

  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!

    if (ch === "*") {
      if (glob[i + 1] === "*") {
        i++

        if (glob[i + 1] === "/") {
          i++
          out += "(?:.*/)?"
        } else {
          out += ".*"
        }

        continue
      }

      out += "[^/]*"
      continue
    }

    if (ch === "?") {
      out += "[^/]"
      continue
    }

    if (ch === "[") {
      const end = glob.indexOf("]", i + 1)

      if (end > i + 1) {
        out += glob.slice(i, end + 1)
        i = end
        continue
      }
    }

    out += escapeRegex(ch)
  }

  return out
}

const compileRule = (raw: string): IgnoreRule | null => {
  let pattern = raw.trim()

  if (!pattern || pattern.startsWith("#")) return null

  let negate = false

  if (pattern.startsWith("!")) {
    negate = true
    pattern = pattern.slice(1)
  }

  let dirOnly = false

  if (pattern.endsWith("/")) {
    dirOnly = true
    pattern = pattern.slice(0, -1)
  }

  if (!pattern) return null

  const anchored = pattern.startsWith("/") || pattern.includes("/")

  if (pattern.startsWith("/")) pattern = pattern.slice(1)

  const body = globToRegex(pattern)

  return {
    regex: anchored ? new RegExp(`^${body}$`) : new RegExp(`(?:^|/)${body}$`),
    negate,
    dirOnly,
  }
}

const compileRules = (patterns: string[]): IgnoreRule[] => {
  const rules: IgnoreRule[] = []

  for (const pattern of patterns) {
    const rule = compileRule(pattern)

    if (rule) rules.push(rule)
  }

  return rules
}

const decide = (rules: IgnoreRule[], candidate: string, isDir: boolean): boolean | null => {
  let decision: boolean | null = null

  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue
    if (rule.regex.test(candidate)) decision = !rule.negate
  }

  return decision
}

const readGitignore = (appDir: string): string[] => {
  const path = join(appDir, ".gitignore")

  if (!existsSync(path)) return []

  try {
    return readFileSync(path, "utf8").split(/\r?\n/)
  } catch {
    return []
  }
}

export const createIgnoreFilter = (
  appDir: string,
  manifest: AppManifest | null,
  extra: string[] = [],
): IgnoreFilter => {
  const defaults = compileRules(DEFAULT_IGNORE)
  const rules = compileRules([...readGitignore(appDir), ...(manifest?.ignore ?? []), ...extra])

  const ignored = (path: string, isDir = false): boolean => {
    const clean = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")

    if (!clean) return false

    const parts = clean.split("/")

    for (let i = 1; i <= parts.length; i++) {
      const candidate = parts.slice(0, i).join("/")
      const candidateIsDir = i < parts.length || isDir

      if (decide(defaults, candidate, candidateIsDir) === true) return true
      if (decide(rules, candidate, candidateIsDir) === true) return true
    }

    return false
  }

  return { ignored }
}
