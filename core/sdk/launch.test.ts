import { describe, expect, test } from "bun:test"
import { parseLaunchArgs } from "./launch.ts"

describe("parseLaunchArgs", () => {
  test("ignores the program path and options", () => {
    const result = parseLaunchArgs(["/app/pulsar", "--flag", "-x", ""], "/tmp")

    expect(result.urls).toEqual([])
    expect(result.files).toEqual([])
  })

  test("collects deep-link URLs", () => {
    const result = parseLaunchArgs(["/app/pulsar", "myapp://open?id=1", "mailto:a@b.c"], "/tmp")

    expect(result.urls).toEqual(["myapp://open?id=1", "mailto:a@b.c"])
    expect(result.files).toEqual([])
  })

  test("collects files and resolves relative paths", () => {
    const result = parseLaunchArgs(["/app/pulsar", "docs/readme.md", "/etc/hosts"], "/home/user")

    expect(result.files).toEqual(["/home/user/docs/readme.md", "/etc/hosts"])
    expect(result.urls).toEqual([])
  })

  test("treats file URLs as paths", () => {
    const result = parseLaunchArgs(["/app/pulsar", "file:///tmp/report.pdf"], "/tmp")

    expect(result.files).toEqual(["/tmp/report.pdf"])
    expect(result.urls).toEqual([])
  })

  test("treats a Windows drive letter as a path, not a scheme", () => {
    const result = parseLaunchArgs(["C:\\pulsar.exe", "C:\\Users\\me\\doc.txt"], "C:\\")

    expect(result.urls).toEqual([])
    expect(result.files.length).toBe(1)
  })
})
