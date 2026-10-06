import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { assertSerializable } from "../sdk/app.ts"
import type { CapRegistry } from "../sdk/index.ts"
import { appPaths } from "./paths.ts"

const FILE = "storage.json"

async function readStore(): Promise<Record<string, unknown>> {
  const dataDir = (await appPaths()).data
  try {
    const raw = await readFile(join(dataDir, FILE), "utf8")
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeStore(data: Record<string, unknown>): Promise<void> {
  const dataDir = (await appPaths()).data
  await writeFile(join(dataDir, FILE), JSON.stringify(data, null, 2), "utf8")
}

export const storageCaps: CapRegistry = {
  "storage.get": async (p: { key: string }) => (await readStore())[p.key],

  "storage.has": async (p: { key: string }) => p.key in (await readStore()),

  "storage.set": async (p: { key: string; value: unknown }) => {
    assertSerializable(p.value, p.key)
    const data = await readStore()
    data[p.key] = p.value
    await writeStore(data)
    return true
  },

  "storage.remove": async (p: { key: string }) => {
    const data = await readStore()
    if (!(p.key in data)) return false
    delete data[p.key]
    await writeStore(data)
    return true
  },
}
