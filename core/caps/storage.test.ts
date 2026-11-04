import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createStorageCaps } from "./storage.ts"
import type { Platform } from "../platform.ts"
import { createBunPlatform } from "../platform/bun.ts"
import { resetAppPaths } from "../platform/bun-paths.ts"

let dir: string
let savedData: string | undefined
let savedHome: string | undefined

const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "pulsar-storage-"))
  savedData = process.env.XDG_DATA_HOME
  savedHome = process.env.HOME
  process.env.XDG_DATA_HOME = dir
  process.env.HOME = dir
  resetAppPaths()
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  restore("XDG_DATA_HOME", savedData)
  restore("HOME", savedHome)
  resetAppPaths()
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

describe("storage durability", () => {
  const platformWith = (overrides: Partial<Platform>): Platform => {
    return { ...createBunPlatform(), ...overrides }
  }

  test("a corrupted file is kept aside and not overwritten", async () => {
    const data = join(dir, "corrupt-case")
    const platform = platformWith({ paths: async () => ({ data, config: data, cache: data, temp: data, home: data }) })
    const store = createStorageCaps(platform)

    mkdirSync(data, { recursive: true })
    writeFileSync(join(data, "storage.json"), '{"todos":[1,2')

    await store["storage.set"]!({ key: "next", value: 1 } as never)

    const backup = readdirSync(data).find((name) => name.includes(".corrupt-"))

    expect(backup).toBeDefined()
    expect(readFileSync(join(data, backup!), "utf8")).toBe('{"todos":[1,2')
    expect(JSON.parse(readFileSync(join(data, "storage.json"), "utf8"))).toEqual({ next: 1 })
  })

  test("a failed read does not overwrite the file", async () => {
    const data = join(dir, "read-error-case")
    const platform = platformWith({
      paths: async () => ({ data, config: data, cache: data, temp: data, home: data }),
      readFile: async () => {
        throw new Error("EIO")
      },
    })
    const store = createStorageCaps(platform)

    mkdirSync(data, { recursive: true })
    writeFileSync(join(data, "storage.json"), '{"keep":true}')

    expect(store["storage.set"]!({ key: "next", value: 1 } as never)).rejects.toThrow("EIO")
    await Bun.sleep(5)
    expect(readFileSync(join(data, "storage.json"), "utf8")).toBe('{"keep":true}')
  })

  test("a failed write rejects and keeps the previous file", async () => {
    const data = join(dir, "write-error-case")
    const platform = platformWith({
      paths: async () => ({ data, config: data, cache: data, temp: data, home: data }),
      writeFileAtomic: async () => {
        throw new Error("ENOSPC")
      },
    })
    const store = createStorageCaps(platform)

    mkdirSync(data, { recursive: true })
    writeFileSync(join(data, "storage.json"), '{"keep":true}')

    expect(store["storage.set"]!({ key: "next", value: 1 } as never)).rejects.toThrow("ENOSPC")
    await Bun.sleep(5)
    expect(readFileSync(join(data, "storage.json"), "utf8")).toBe('{"keep":true}')
  })

  test("an atomic write leaves no temporary files", async () => {
    const data = join(dir, "atomic-case")

    await createBunPlatform().writeFileAtomic(join(data, "file.json"), "first")
    await createBunPlatform().writeFileAtomic(join(data, "file.json"), "second")

    expect(readdirSync(data)).toEqual(["file.json"])
    expect(readFileSync(join(data, "file.json"), "utf8")).toBe("second")
  })
})
