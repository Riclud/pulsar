import { describe, expect, test } from "bun:test"
import { bunVersionCompatible, compareSemver } from "./version.ts"

describe("compareSemver", () => {
  test("compares numeric parts", () => {
    expect(compareSemver("1.2.0", "1.2.0")).toBe(0)
    expect(compareSemver("1.2.1", "1.2.0")).toBe(1)
    expect(compareSemver("1.1.9", "1.2.0")).toBe(-1)
    expect(compareSemver("2.0.0", "1.99.99")).toBe(1)
    expect(compareSemver("1.12", "1.9")).toBe(1)
  })

  test("tolerates missing parts", () => {
    expect(compareSemver("1.2", "1.2.0")).toBe(0)
    expect(compareSemver("1.2", "1.2.1")).toBe(-1)
  })
})

describe("bunVersionCompatible", () => {
  test("accepts supported versions", () => {
    expect(bunVersionCompatible("1.2.0")).toBe(true)
    expect(bunVersionCompatible("1.3.11")).toBe(true)
    expect(bunVersionCompatible("2.0.0")).toBe(true)
  })

  test("rejects too old versions", () => {
    expect(bunVersionCompatible("1.1.0")).toBe(false)
    expect(bunVersionCompatible("0.9.0")).toBe(false)
  })
})
