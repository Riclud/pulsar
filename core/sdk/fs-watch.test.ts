import { describe, expect, test } from "bun:test"
import { fs, fsWatchInternals, registerCapability } from "./caps.ts"

describe("fs.watch", () => {
  test("reference-counts watches per path and forwards changes", () => {
    const calls: string[] = []
    const seen: string[] = []

    registerCapability("fs.watch", (async (p: { path: string }) => {
      calls.push(`watch:${p.path}`)

      return true
    }) as never)
    registerCapability("fs.unwatch", (async (p: { path: string }) => {
      calls.push(`unwatch:${p.path}`)

      return true
    }) as never)

    const offOne = fs.watch("/data/a.txt", (path) => seen.push(`one:${path}`))
    const offTwo = fs.watch("/data/a.txt", (path) => seen.push(`two:${path}`))

    expect(calls).toEqual(["watch:/data/a.txt"])

    fsWatchInternals.notify("/data/a.txt")
    expect(seen).toEqual(["one:/data/a.txt", "two:/data/a.txt"])

    offOne()
    expect(calls).toEqual(["watch:/data/a.txt"])

    offTwo()
    expect(calls).toEqual(["watch:/data/a.txt", "unwatch:/data/a.txt"])

    fsWatchInternals.notify("/data/a.txt")
    expect(seen.length).toBe(2)
  })
})
