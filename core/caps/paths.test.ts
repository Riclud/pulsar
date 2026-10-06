import { describe, expect, test } from "bun:test"
import { join } from "path"
import { computePaths, sanitizeAppId } from "./paths.ts"

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
