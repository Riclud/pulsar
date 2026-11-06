import { describe, expect, test } from "bun:test"
import { keepForApp } from "./qt.ts"

describe("keepForApp", () => {
  test("drops the shader compiler and unused styles", () => {
    expect(keepForApp("lib/Qt/bin/qsb", true)).toBe(false)
    expect(keepForApp("lib/Qt/lib/libQt6ShaderTools.so.6", true)).toBe(false)
    expect(keepForApp("bin/Qt6ShaderTools.dll", true)).toBe(false)
    expect(keepForApp("lib/Qt/lib/libQt6QuickControls2Fusion.so.6", true)).toBe(false)
    expect(keepForApp("lib/Qt/qml/QtQuick/Controls/FluentWinUI3/Config.qml", true)).toBe(false)
  })

  test("keeps the styles Pulsar uses", () => {
    expect(keepForApp("lib/Qt/lib/libQt6QuickControls2Basic.so.6", false)).toBe(true)
    expect(keepForApp("lib/Qt/lib/libQt6QuickControls2Material.so.6", false)).toBe(true)
    expect(keepForApp("lib/Qt/qml/QtQuick/Controls/Material/qmldir", false)).toBe(true)
  })

  test("keeps FFmpeg only for apps that play media", () => {
    expect(keepForApp("lib/Qt/lib/libavcodec.so.61", false)).toBe(false)
    expect(keepForApp("bin/avformat-61.dll", false)).toBe(false)
    expect(keepForApp("lib/Qt/plugins/multimedia/libffmpegmediaplugin.so", false)).toBe(false)
    expect(keepForApp("lib/Qt/lib/libavcodec.so.61", true)).toBe(true)
    expect(keepForApp("lib/Qt/lib/libQt6Multimedia.so.6", false)).toBe(true)
  })
})
