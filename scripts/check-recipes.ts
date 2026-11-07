#!/usr/bin/env bun
// Typechecks every ```ts block of the agent skill's recipes against the SDK, so the
// examples agents copy cannot drift from the API.
import { spawnSync } from "child_process"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

const root = resolve(import.meta.dir, "..")
const recipes = readFileSync(join(root, "skills", "pulsar", "recipes.md"), "utf8")
// Windows checkouts may use CRLF line endings.
const blocks = [...recipes.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((match) => match[1]!)

// Names a recipe uses as given; each block that uses one without defining it gets a stub.
const STUBS: Record<string, string> = {
  app: 'declare const app: import("pulsar").App',
  state: "declare const state: { notes: { id: string; text: string }[] }",
  token: "declare const token: string",
  contacts: "declare const contacts: { id: string; name: string; phone: string }[]",
  openContact: "declare const openContact: (id: string) => void",
  removeContact: "declare const removeContact: (id: string) => void",
  register: "declare const register: (address: string) => Promise<void>",
  List: 'declare const List: () => import("pulsar").UiNode',
  Details: 'declare const Details: () => import("pulsar").UiNode',
}

const stubsFor = (code: string) => {
  return Object.entries(STUBS)
    .filter(([name]) => new RegExp(`\\b${name}\\b`).test(code))
    .filter(([name]) => !new RegExp(`(const|let|function)\\s+${name}\\b`).test(code))
    .map(([, stub]) => stub)
}

if (blocks.length === 0) {
  console.error("check-recipes: no ts blocks found in recipes.md")
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), "pulsar-recipes-"))

try {
  mkdirSync(join(dir, "node_modules", "@types"), { recursive: true })
  symlinkSync(join(root, "core", "sdk"), join(dir, "node_modules", "pulsar"), "dir")
  // The real path keeps @types/bun next to its own bun-types in Bun's isolated layout.
  symlinkSync(realpathSync(join(root, "node_modules", "@types", "bun")), join(dir, "node_modules", "@types", "bun"), "dir")

  blocks.forEach((code, index) => {
    const file = `recipe-${String(index + 1).padStart(2, "0")}.ts`

    writeFileSync(join(dir, file), `${stubsFor(code).join("\n")}\n${code}\nexport {}\n`)
  })

  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        lib: ["ESNext"],
        target: "ESNext",
        module: "Preserve",
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        types: ["bun"],
      },
      include: ["*.ts"],
    }),
  )

  const tsc = spawnSync(join(root, "node_modules", ".bin", "tsc"), ["-p", dir], { encoding: "utf8" })

  if (tsc.status !== 0) {
    console.error(tsc.stdout)
    console.error(`check-recipes: FAILED (${blocks.length} blocks)`)
    process.exit(1)
  }

  console.log(`check-recipes: OK (${blocks.length} blocks)`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
