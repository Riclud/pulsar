import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { usesMedia } from "./app.ts"

const dirs: string[] = []

const appWith = (file: string, text: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "pulsar-media-"))

  dirs.push(dir)
  mkdirSync(join(dir, "src"))
  writeFileSync(join(dir, "src", file), text)

  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("usesMedia", () => {
  test("the Video node needs the video backend", () => {
    expect(usesMedia(appWith("main.ts", 'Video({ source: "intro.mp4" })'))).toBe(true)
    expect(usesMedia(appWith("main.tsx", '<Video source="intro.mp4" />'))).toBe(true)
  })

  test("an app without media does not", () => {
    expect(usesMedia(appWith("main.ts", 'Text({ text: "Video" })'))).toBe(false)
  })

  test("a QML player still counts", () => {
    expect(usesMedia(appWith("player.qml", "MediaPlayer { }"))).toBe(true)
  })
})
