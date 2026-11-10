import { describe, expect, test } from "bun:test"
import { join } from "path"

describe("pulsar help", () => {
  test("lists the environment variables, including PULSAR_SOURCE", () => {
    const run = Bun.spawnSync({
      cmd: [process.execPath, join(import.meta.dir, "index.ts"), "help"],
      env: { ...process.env, NO_COLOR: "1" },
    })
    const text = run.stdout.toString()

    expect(run.exitCode).toBe(0)
    expect(text).toContain("Environment")
    expect(text).toMatch(/PULSAR_SOURCE\s+use a Pulsar checkout/)
  })
})
