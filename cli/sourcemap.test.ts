import { describe, expect, test } from "bun:test"
import { mapErrorText, parseInlineSourceMap } from "./sourcemap.ts"

const inlineBundle = (map: unknown): string => {
  const encoded = Buffer.from(JSON.stringify(map)).toString("base64")

  return `console.log("app")\n//# sourceMappingURL=data:application/json;base64,${encoded}\n`
}

const map = {
  version: 3,
  sources: ["src/main.ts"],
  names: [],
  mappings: "AAAA,IAAI",
}

describe("parseInlineSourceMap", () => {
  test("maps generated positions back to the original source", () => {
    const mapper = parseInlineSourceMap(inlineBundle(map))

    expect(mapper?.map(1, 0)).toEqual({ source: "src/main.ts", line: 1, column: 1 })
    expect(mapper?.map(1, 5)).toEqual({ source: "src/main.ts", line: 1, column: 5 })
  })

  test("returns null without a source map", () => {
    expect(parseInlineSourceMap("console.log(1)\n")).toBeNull()
  })
})

describe("mapErrorText", () => {
  test("rewrites runtime.js frames", () => {
    const mapper = parseInlineSourceMap(inlineBundle(map))
    const text = "runtime (runtime.js:1:5)\n    at boom (runtime.js:1:0)"

    expect(mapErrorText(text, mapper)).toBe("runtime (src/main.ts:1:5)\n    at boom (src/main.ts:1:1)")
  })

  test("keeps the text when there is no map", () => {
    expect(mapErrorText("runtime.js:1:5", null)).toBe("runtime.js:1:5")
  })
})
