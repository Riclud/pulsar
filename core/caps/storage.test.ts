import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { storageCaps } from "./storage.ts"

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "pulsar-storage-"))
  process.env.XDG_DATA_HOME = dir
  process.env.HOME = dir
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const call = (name: keyof typeof storageCaps, params: unknown) => {
  const handler = storageCaps[name]
  if (!handler) throw new Error(`no handler: ${name}`)
  return handler(params)
}

describe("storage", () => {
  test("set/get/has/remove round trip", async () => {
    expect(await call("storage.has", { key: "todos" })).toBe(false)
    expect(await call("storage.set", { key: "todos", value: { n: 42, list: [1, 2, 3] } })).toBe(true)
    expect(await call("storage.has", { key: "todos" })).toBe(true)
    expect(await call("storage.get", { key: "todos" })).toEqual({ n: 42, list: [1, 2, 3] })
    expect(await call("storage.remove", { key: "todos" })).toBe(true)
    expect(await call("storage.has", { key: "todos" })).toBe(false)
    expect(await call("storage.remove", { key: "todos" })).toBe(false)
  })

  test("rejects non-json values", async () => {
    await expect(call("storage.set", { key: "bad", value: new Map() })).rejects.toThrow(/Map/)
  })
})
