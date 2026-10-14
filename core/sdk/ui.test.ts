import { describe, expect, test } from "bun:test"
import { button, checkbox, column, dispatchUiEvent, forgetHandlers, serialize, ui } from "./ui.ts"

describe("ui", () => {
  test("serializes a tree without callbacks", () => {
    const tree = column({ gap: 4 }, [ui.text("hi"), button("go", { onClick: () => {} })])
    const out = serialize([tree]) as Array<{ type: string; children: unknown[] }>

    expect(out[0]!.type).toBe("column")
    expect(out[0]!.children.length).toBe(2)
    expect(JSON.stringify(out)).not.toContain("onClick")
  })

  test("dispatches events to the registered callback", () => {
    let clicked = 0
    const node = button("go", { onClick: () => clicked++ })

    dispatchUiEvent(node.id, "click", undefined)
    expect(clicked).toBe(1)

    forgetHandlers([node.id])
    dispatchUiEvent(node.id, "click", undefined)
    expect(clicked).toBe(1)
  })

  test("checkbox toggle forwards the value", () => {
    const seen: boolean[] = []
    const node = checkbox("x", { onToggle: (value) => seen.push(value) })

    dispatchUiEvent(node.id, "toggle", true)
    expect(seen).toEqual([true])
  })
})
