import { describe, expect, test } from "bun:test"
import { Store } from "./app.ts"

describe("Store", () => {
  test("accepts plain JSON values", () => {
    const store = new Store()
    store.set("a", 1)
    store.set("b", "x")
    store.set("c", true)
    store.set("d", null)
    store.set("e", [1, 2, { f: "g" }])
    expect(store.get("a")).toBe(1)
    expect(store.get("e")).toEqual([1, 2, { f: "g" }])
  })

  test("rejects non-serializable values", () => {
    const store = new Store()
    expect(() => store.set("fn", () => {})).toThrow(/function/)
    expect(() => store.set("map", new Map())).toThrow(/Map/)
    expect(() => store.set("date", new Date())).toThrow(/Date/)
    expect(() => store.set("big", 1n)).toThrow(/bigint/)
    expect(() => store.set("undef", undefined)).toThrow(/undefined/)
    expect(() => store.set("nan", NaN)).toThrow(/finite/)
  })

  test("rejects circular references", () => {
    const store = new Store()
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(() => store.set("loop", obj)).toThrow(/circular/)
  })

  test("tracks changes and removals", () => {
    const store = new Store()
    store.set("a", 1)
    store.takePatch()
    store.set("a", 2)
    store.delete("a")
    store.set("b", 3)
    const patch = store.takePatch()
    expect(patch.removed).toEqual(["a"])
    expect(patch.changed).toEqual({ b: 3 })
  })
})
