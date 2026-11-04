import { storage } from "./caps.ts"

export interface Migration {
  version: number
  up: () => void | Promise<void>
}

export interface MigrationStore {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<unknown>
}

export interface MigrationOptions {
  key?: string
  store?: MigrationStore
}

export const runMigrations = async (
  migrations: Migration[],
  options: MigrationOptions = {},
): Promise<number> => {
  const key = options.key ?? "schemaVersion"
  const store = options.store ?? storage
  const saved = await store.get(key)

  let current = typeof saved === "number" && Number.isFinite(saved) ? saved : 0
  const ordered = [...migrations].sort((a, b) => a.version - b.version)

  for (const migration of ordered) {
    if (migration.version <= current) continue

    await migration.up()
    await store.set(key, migration.version)

    current = migration.version
  }

  return current
}
