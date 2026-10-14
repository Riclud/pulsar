import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { installCapabilities } from "./index.ts"
import { fs } from "../sdk/caps.ts"

installCapabilities()

describe("fs capabilities", () => {
  test("write/read/append/stat/list/rename/copy/remove round trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulsar-fs-"))
    try {
      const file = join(dir, "nested", "a.txt")
      await fs.writeFile(file, "hello")
      await fs.appendFile(file, " world")

      expect(await fs.exists(file)).toBe(true)
      expect(await fs.readFile(file)).toBe("hello world")

      const stat = await fs.stat(file)
      expect(stat.isFile).toBe(true)
      expect(stat.size).toBe(11)

      expect(await fs.listDir(join(dir, "nested"))).toEqual(["a.txt"])

      const copy = join(dir, "nested", "b.txt")
      await fs.copy(file, copy)
      expect(await fs.readFile(copy)).toBe("hello world")

      const renamed = join(dir, "nested", "c.txt")
      await fs.rename(copy, renamed)
      expect(await fs.exists(copy)).toBe(false)
      expect(await fs.readFile(renamed)).toBe("hello world")

      await fs.remove(join(dir, "nested"), true)
      expect(await fs.exists(join(dir, "nested"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("binary read/write via base64", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulsar-bin-"))
    try {
      const file = join(dir, "blob.bin")
      const bytes = Buffer.from([0, 1, 2, 253, 254, 255]).toString("base64")
      await fs.writeFile(file, bytes, "base64")
      expect(await fs.readFile(file, "base64")).toBe(bytes)
      expect(await fs.exists(file)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
