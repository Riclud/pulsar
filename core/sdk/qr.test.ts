import { describe, expect, test } from "bun:test"
import { spawnSync } from "child_process"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { encodeQr } from "./qr.ts"

const hasZbar = spawnSync("zbarimg", ["--version"]).status === 0

// Renders the modules as a PBM with the quiet zone and decodes it with zbarimg.
const decode = (rows: boolean[][]): string => {
  const size = rows.length + 8
  const lines = ["P1", `${size * 2} ${size * 2}`]

  for (let y = 0; y < size * 2; y++) {
    const line: string[] = []

    for (let x = 0; x < size * 2; x++) {
      const mx = Math.floor(x / 2) - 4
      const my = Math.floor(y / 2) - 4

      line.push(rows[my]?.[mx] ? "1" : "0")
    }

    lines.push(line.join(" "))
  }

  const dir = mkdtempSync(join(tmpdir(), "pulsar-qr-"))

  try {
    writeFileSync(join(dir, "code.pbm"), `${lines.join("\n")}\n`)

    return spawnSync("zbarimg", ["-q", "--raw", join(dir, "code.pbm")], { encoding: "utf8" }).stdout.replace(/\n$/, "")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("encodeQr", () => {
  test("picks the smallest version and draws the finder patterns", () => {
    const rows = encodeQr("short")

    expect(rows.length).toBe(21)
    expect(rows[0]!.slice(0, 7).every(Boolean)).toBe(true)
    expect(rows[1]![1]).toBe(false)
    expect(rows[3]![3]).toBe(true)
  })

  test("grows with the text and the error correction", () => {
    expect(encodeQr("x".repeat(100), "L").length).toBeLessThan(encodeQr("x".repeat(100), "H").length)
  })

  test.skipIf(!hasZbar)("decodes back to the text", () => {
    for (const [text, ecc] of [
      ["pmsync://192.168.50.227:8010?k=secret", "M"],
      ["Пароли 🔐", "Q"],
      ["y".repeat(400), "H"],
      ["z".repeat(1200), "M"],
    ] as const) {
      expect(decode(encodeQr(text, ecc))).toBe(text)
    }
  })
})
