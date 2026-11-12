import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { collectKnownProps, renderKnownProps } from "../../scripts/gen-known-props.ts"
import { readFileSync } from "fs"
import { join } from "path"
import { Badge, Box, Button, Column, Input, Scroll, Text, TextArea } from "./index.ts"
import { resetUnknownPropWarnings } from "./unknown-props.ts"

const original = console.warn

let warnings: string[] = []

const loose = (component: unknown, props: Record<string, unknown>): void => {
  ;(component as (props: Record<string, unknown>) => unknown)(props)
}

beforeEach(() => {
  warnings = []
  console.warn = (...args: unknown[]) => void warnings.push(args.join(" "))
  globalThis.__PULSAR_DEV = true
  resetUnknownPropWarnings()
})

afterEach(() => {
  console.warn = original
  globalThis.__PULSAR_DEV = undefined
  resetUnknownPropWarnings()
})

describe("unknown props", () => {
  test("names the component, the prop and the likely intended prop", () => {
    loose(Badge, { text: "7" })

    expect(warnings).toEqual(["[pulsar] Badge: unknown prop `text`; did you mean `label`?"])
  })

  test("suggests a close spelling", () => {
    loose(Badge, { lable: "7" })

    expect(warnings).toEqual(["[pulsar] Badge: unknown prop `lable`; did you mean `label`?"])
  })

  test("leaves out the suggestion when nothing is close", () => {
    loose(Badge, { zzzzzzzz: 1 })

    expect(warnings).toEqual(["[pulsar] Badge: unknown prop `zzzzzzzz`"])
  })

  test("warns once per component and prop", () => {
    loose(Badge, { text: "1" })
    loose(Badge, { text: "2" })
    loose(Badge, { other: "2" })
    loose(Box, { text: "2" })

    expect(warnings.length).toBe(3)
  })

  test("uses the public name of the component", () => {
    loose(Input, { placeholderr: "x" })
    loose(TextArea, { nope: 1 })

    expect(warnings[0]).toContain("Input: unknown prop `placeholderr`")
    expect(warnings[1]).toContain("TextArea: unknown prop `nope`")
  })

  test("stays quiet for known, common and handler props, keys and children", () => {
    Badge({ label: "7", count: 7, key: "a", width: 20, onLayout: () => {} })
    loose(Badge, { onSomethingElse: () => {}, children: [] })
    Button({ label: "Go", onClick: () => {}, width: 100 })
    Input({ value: "", placeholder: "x", onInput: () => {}, onSubmitted: () => {}, focus: true })
    Column({ gap: 4, padding: 4 }, Text({}, "hi"), Scroll({ gap: 2 }))

    expect(warnings).toEqual([])
  })

  test("stays quiet outside a dev build", () => {
    globalThis.__PULSAR_DEV = undefined
    resetUnknownPropWarnings()

    loose(Badge, { text: "7" })

    expect(warnings).toEqual([])
  })

  test("the table of known props matches the option types", () => {
    const file = readFileSync(join(import.meta.dir, "known-props.ts"), "utf8")

    expect(file).toBe(renderKnownProps(collectKnownProps()))
  })
})
