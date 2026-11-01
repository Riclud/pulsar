import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { AppManifest } from "../core/sdk/manifest.ts"
import { androidPackageName, appFiles, devManifest } from "./android.ts"

const manifest: AppManifest = {
  id: "com.example.app",
  name: "example",
  version: "1.2.3",
  targets: ["android"],
  compat: "portable",
}

describe("androidPackageName", () => {
  test("keeps the manifest id for release builds", () => {
    expect(androidPackageName(manifest)).toBe("com.example.app")
  })

  test("appends .dev for dev builds", () => {
    expect(androidPackageName(manifest, true)).toBe("com.example.app.dev")
  })

  test("falls back to the default id", () => {
    expect(androidPackageName(null, true)).toBe("com.pulsar.app.dev")
  })
})

describe("devManifest", () => {
  test("keeps the app fields and changes only the id", () => {
    const dev = devManifest(manifest)

    expect(dev.id).toBe("com.example.app.dev")
    expect(dev.name).toBe("example")
    expect(dev.version).toBe("1.2.3")
    expect(dev.targets).toEqual(["android"])
  })
})

describe("appFiles", () => {
  test("walks the app and skips build, dist and tool directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "pulsar-appfiles-"))

    try {
      writeFileSync(join(dir, "main.ts"), "export {}")
      writeFileSync(join(dir, "pulsar.json"), "{}")
      mkdirSync(join(dir, "ui"))
      writeFileSync(join(dir, "ui", "main.qml"), "Item {}")
      mkdirSync(join(dir, "build"))
      writeFileSync(join(dir, "build", "x"), "x")
      mkdirSync(join(dir, "dist"))
      writeFileSync(join(dir, "dist", "x"), "x")
      mkdirSync(join(dir, "node_modules"))
      writeFileSync(join(dir, "node_modules", "x"), "x")
      mkdirSync(join(dir, ".pulsar"))
      writeFileSync(join(dir, ".pulsar", "dev.json"), "{}")

      expect(appFiles(dir).sort()).toEqual(["main.ts", "pulsar.json", "ui/main.qml"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
