import { describe, expect, test } from "bun:test"
import { CSS_COLOR_NAMES, defineTheme, isColorName, type ColorValue } from "./theme.ts"

declare module "./theme.ts" {
  interface ThemeColors {
    brand: string
    ink: string
  }
}

describe("theme colors", () => {
  test("recognizes CSS color names", () => {
    expect(isColorName("black")).toBe(true)
    expect(isColorName("blue")).toBe(true)
    expect(isColorName("rebeccapurple")).toBe(true)
    expect(isColorName("brand")).toBe(false)
    expect(isColorName("not-a-color")).toBe(false)
  })

  test("accepts named colors, custom tokens and CSS formats", () => {
    const named: ColorValue = "black"
    const token: ColorValue = "brand"
    const hex: ColorValue = "#ff5722"
    const rgb: ColorValue = "rgba(255, 87, 34, 0.5)"

    expect([named, token, hex, rgb]).toEqual(["black", "brand", "#ff5722", "rgba(255, 87, 34, 0.5)"])
  })

  test("the named palette covers the CSS basics", () => {
    expect(CSS_COLOR_NAMES).toContain("black")
    expect(CSS_COLOR_NAMES).toContain("white")
    expect(CSS_COLOR_NAMES).toContain("blue")
    expect(CSS_COLOR_NAMES).toContain("deepskyblue")
    expect(CSS_COLOR_NAMES.length).toBeGreaterThan(140)
  })

  test("defineTheme keeps custom color tokens", () => {
    const theme = defineTheme({
      colors: { brand: "#ff5722", ink: "#101014" },
      radius: 14,
      motion: { fast: 100, normal: 180 },
    })

    expect(theme.colors?.brand).toBe("#ff5722")
    expect(theme.motion?.normal).toBe(180)
  })
})
