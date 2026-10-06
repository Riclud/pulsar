import { describe, expect, test } from "bun:test"
import { resolveAppConfig, resolveWindows } from "./manifest.ts"
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

describe("resolveWindows", () => {
  test("maps manifest windows and assigns labels", () => {
    const wins = resolveWindows({ id: "x", windows: [{ ui: "ui/a.qml" }, { label: "side", ui: "ui/b.qml" }] })
    expect(wins.length).toBe(2)
    expect(wins[0]!.label).toBe("main")
    expect(wins[0]!.ui).toBe("ui/a.qml")
    expect(wins[1]!.label).toBe("side")
    expect(wins[1]!.id).toBe("x")
  })

  test("collapses to one window when explicit options are given", () => {
    const wins = resolveWindows({ windows: [{ ui: "ui/a.qml" }, { ui: "ui/b.qml" }] }, { ui: "ui/c.qml" })
    expect(wins.length).toBe(1)
    expect(wins[0]!.ui).toBe("ui/c.qml")
  })
})
