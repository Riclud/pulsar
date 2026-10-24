import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createStorageCaps } from "./storage.ts"
import { createBunPlatform } from "../platform/bun.ts"

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "pulsar-storage-"))
  process.env.XDG_DATA_HOME = dir
  process.env.HOME = dir
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const caps = createStorageCaps(createBunPlatform())

const call = (name: keyof typeof caps, params: unknown) => {
  const handler = caps[name]

  if (!handler) throw new Error(`no handler: ${name}`)

  const invoke = handler as (p: unknown) => Promise<unknown>

  return invoke(params)
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
