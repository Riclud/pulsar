import { describe, expect, test } from "bun:test"
import { lastLines, runStage, type StageLog } from "./stage.ts"

const recorder = (): StageLog & { lines: string[] } => {
  const lines: string[] = []

  return {
    lines,
    step: (text) => lines.push(`step ${text}`),
    done: (text) => lines.push(`done ${text.replace(/\(\d+\.\ds\)/, "(t)")}`),
    error: (text) => lines.push(`error ${text.replace(/\d+\.\ds/, "t")}`),
    note: (text) => lines.push(`note ${text}`),
  }
}

describe("runStage", () => {
  test("a successful stage prints two lines and keeps the output quiet", async () => {
    const log = recorder()
    const result = await runStage("bundle", process.execPath, ["-e", "console.log('lots of noise')"], {}, log)

    expect(result.status).toBe(0)
    expect(result.output).toContain("lots of noise")
    expect(log.lines).toEqual(["step bundle", "done bundle (t)"])
  })

  test("a failing stage shows the tail of the output and how to see the rest", async () => {
    const log = recorder()
    const script = "for (let i = 1; i <= 100; i++) console.log('line ' + i); console.error('boom'); process.exit(3)"
    const result = await runStage("compile", process.execPath, ["-e", script], { tail: 5 }, log)

    expect(result.status).toBe(3)
    expect(log.lines[1]).toBe("error compile failed (exit 3) after t")
    expect(log.lines[2]).toContain("line 100")
    expect(log.lines[2]).toContain("boom")
    expect(log.lines[2]).not.toContain("line 90")
    expect(log.lines[3]).toContain("--verbose")
  })

  test("a missing tool is a failed stage, not an exception", async () => {
    const log = recorder()
    const result = await runStage("tool", "/nonexistent/pulsar-tool", [], {}, log)

    expect(result.status).toBeNull()
    expect(log.lines[1]).toBe("error tool failed after t")
  })

  test("lastLines drops blank lines and keeps the end", () => {
    expect(lastLines("a\n\nb\nc\n", 2)).toBe("b\nc")
  })
})
