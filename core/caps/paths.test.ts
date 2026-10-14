import { describe, expect, test, afterAll } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { appPaths, computePaths, sanitizeAppId } from "./paths.ts"

const HOME = "/home/tester"

describe("sanitizeAppId", () => {
  test("cleans unsupported characters and falls back", () => {
    expect(sanitizeAppId("My Cool App!")).toBe("my-cool-app")
    expect(sanitizeAppId("../evil")).toBe("evil")
    expect(sanitizeAppId("###")).toBe("pulsar-app")
    expect(sanitizeAppId("")).toBe("pulsar-app")
    expect(sanitizeAppId("..")).toBe("pulsar-app")
    expect(sanitizeAppId("./")).toBe("pulsar-app")
  })
})

describe("computePaths", () => {
  test("linux respects xdg env", () => {
    const p = computePaths("myapp", "linux", HOME, {
      XDG_DATA_HOME: "/xdg/data",
      XDG_CONFIG_HOME: "/xdg/config",
      XDG_CACHE_HOME: "/xdg/cache",
    })
    expect(p.data).toBe("/xdg/data/myapp")
    expect(p.config).toBe("/xdg/config/myapp")
    expect(p.cache).toBe("/xdg/cache/myapp")
    expect(p.temp).toBe("/tmp")
    expect(p.home).toBe(HOME)
  })

  test("linux falls back to home dirs", () => {
    const p = computePaths("myapp", "linux", HOME, {})
    expect(p.data).toBe("/home/tester/.local/share/myapp")
    expect(p.config).toBe("/home/tester/.config/myapp")
    expect(p.cache).toBe("/home/tester/.cache/myapp")
  })

  test("darwin uses Application Support and Caches", () => {
    const p = computePaths("myapp", "darwin", HOME, {})
    expect(p.data).toBe("/home/tester/Library/Application Support/myapp")
    expect(p.config).toBe("/home/tester/Library/Application Support/myapp")
    expect(p.cache).toBe("/home/tester/Library/Caches/myapp")
  })

  test("win32 uses AppData", () => {
    const roaming = join("C:", "Users", "T", "AppData", "Roaming")
    const p = computePaths("myapp", "win32", HOME, { APPDATA: roaming })
    expect(p.data).toBe(join(roaming, "myapp"))
    expect(p.config).toBe(join(roaming, "myapp"))
    expect(p.cache).toBe(join(HOME, "AppData", "Local", "myapp", "cache"))
  })
})

describe("appPaths", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulsar-paths-"))
  const keys = ["PULSAR_APP", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"] as const
  const saved = keys.map((key) => [key, process.env[key]] as const)

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test("creates and memoizes the directories for an app id", async () => {
    process.env.PULSAR_APP = join(dir, "memo-app")
    process.env.XDG_DATA_HOME = join(dir, "data")
    process.env.XDG_CONFIG_HOME = join(dir, "config")
    process.env.XDG_CACHE_HOME = join(dir, "cache")

    const first = await appPaths()
    const second = await appPaths()

    expect(second).toBe(first)
    expect(existsSync(first.data)).toBe(true)
    expect(existsSync(first.config)).toBe(true)
    expect(existsSync(first.cache)).toBe(true)
  })
})
