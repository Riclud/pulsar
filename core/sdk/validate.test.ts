import { describe, expect, test } from "bun:test"
import { email, isValid, max, maxLength, min, minLength, number, pattern, required, validate } from "./validate.ts"

describe("validate", () => {
  test("returns the first failing message", () => {
    const rules = [required("Required"), minLength(3, "Too short")]

    expect(validate("", rules)).toBe("Required")
    expect(validate("ab", rules)).toBe("Too short")
    expect(validate("abc", rules)).toBeNull()
  })

  test("validates formats and ranges", () => {
    expect(email()("a@b.co")).toBeNull()
    expect(email()("a@b")).not.toBeNull()
    expect(number()("12")).toBeNull()
    expect(number()("x")).not.toBeNull()
    expect(min(2)("3")).toBeNull()
    expect(max(2)("3")).not.toBeNull()
    expect(pattern(/^\d+$/)("12")).toBeNull()
    expect(pattern(/^\d+$/)("a")).not.toBeNull()
  })

  test("isValid is a boolean shortcut", () => {
    expect(isValid("abc", [required(), maxLength(5)])).toBe(true)
    expect(isValid("abcdef", [maxLength(5)])).toBe(false)
  })
})
