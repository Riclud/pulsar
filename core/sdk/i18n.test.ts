import { describe, expect, test } from "bun:test"
import { direction, getLocale, interpolate, plural, setLocale, setMessages, t } from "./i18n.ts"

describe("i18n", () => {
  test("interpolates params and falls back to the key", () => {
    expect(interpolate("Hello, {name}", { name: "Ann" })).toBe("Hello, Ann")
    expect(interpolate("{missing}", {})).toBe("{missing}")
    expect(t("nope", {}, "Fallback")).toBe("Fallback")
  })

  test("uses the message table", () => {
    setMessages({ save: "Save" })
    expect(t("save")).toBe("Save")
    setMessages({})
  })

  test("pluralizes by count", () => {
    setLocale("en")
    expect(plural(1, { one: "{count} task", other: "{count} tasks" })).toBe("1 task")
    expect(plural(3, { one: "{count} task", other: "{count} tasks" })).toBe("3 tasks")
  })

  test("tracks locale and direction", () => {
    setLocale("ar")
    expect(getLocale()).toBe("ar")
    expect(direction()).toBe("rtl")
    setLocale("en")
    expect(direction()).toBe("ltr")
  })
})
