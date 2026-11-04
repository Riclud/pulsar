import { describe, expect, test } from "bun:test"
import { runMigrations, type MigrationStore } from "./migrations.ts"

const memoryStore = (): MigrationStore & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>()

  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value)

      return true
    },
  }
}

describe("runMigrations", () => {
  test("runs pending migrations once and stores the version", async () => {
    const store = memoryStore()
    const ran: number[] = []
    const migrations = [
      { version: 2, up: () => { ran.push(2) } },
      { version: 1, up: () => { ran.push(1) } },
    ]

    expect(await runMigrations(migrations, { store })).toBe(2)
    expect(ran).toEqual([1, 2])
    expect(store.data.get("schemaVersion")).toBe(2)

    expect(await runMigrations(migrations, { store })).toBe(2)
    expect(ran).toEqual([1, 2])
  })
})
