import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { linkSdk } from "./core.ts"

const withTemp = (run: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), "pulsar-sdk-"))

  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const makeSdk = (dir: string, marker: string): string => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "index.ts"), `export const marker = "${marker}"\n`)

  return dir
}

describe("linkSdk", () => {
  test("relinks an app to another SDK version", () => {
    withTemp((dir) => {
      const first = makeSdk(join(dir, "versions", "1.2.0", "core", "sdk"), "old")
      const second = makeSdk(join(dir, "versions", "1.2.1", "core", "sdk"), "new")
      const app = join(dir, "app")
      const link = join(app, "node_modules", "pulsar")

      mkdirSync(app, { recursive: true })

      linkSdk(app, first)
      expect(readFileSync(join(link, "index.ts"), "utf8")).toContain("old")

      linkSdk(app, second)
      expect(readFileSync(join(link, "index.ts"), "utf8")).toContain("new")
    })
  })
})
