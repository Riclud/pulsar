import { describe, expect, test } from "bun:test"
import { resolveKey } from "./device.ts"

describe("resolveKey", () => {
  test("maps names to Android keycodes", () => {
    expect(resolveKey("back")).toBe("4")
    expect(resolveKey("ENTER")).toBe("66")
  })

  test("passes numeric keycodes through", () => {
    expect(resolveKey("187")).toBe("187")
  })

  test("rejects unknown names", () => {
    expect(resolveKey("nope")).toBeUndefined()
  })
})
