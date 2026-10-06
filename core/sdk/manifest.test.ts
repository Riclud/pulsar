import { describe, expect, test } from "bun:test"
import { resolveAppConfig } from "./manifest.ts"
import type { AppManifest } from "./manifest.ts"

const manifest: AppManifest = {
  id: "com.example.app",
  windows: [{ label: "main", ui: "ui/win.qml", width: 900, title: "From manifest", resizable: false }],
}

describe("resolveAppConfig", () => {
  test("uses manifest defaults", () => {
    const config = resolveAppConfig(manifest)
    expect(config.ui).toBe("ui/win.qml")
    expect(config.width).toBe(900)
    expect(config.title).toBe("From manifest")
    expect(config.resizable).toBe(false)
    expect(config.id).toBe("com.example.app")
  })

  test("explicit values override the manifest", () => {
    const config = resolveAppConfig(manifest, { ui: "ui/other.qml", width: 320 })
    expect(config.ui).toBe("ui/other.qml")
    expect(config.width).toBe(320)
    expect(config.title).toBe("From manifest")
  })

  test("falls back without a manifest", () => {
    const config = resolveAppConfig(null)
    expect(config.ui).toBe("ui/main.qml")
    expect(config.id).toBeUndefined()
  })
})
