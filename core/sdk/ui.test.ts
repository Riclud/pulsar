import { describe, expect, test } from "bun:test"
import {
  appBar,
  button,
  checkbox,
  chip,
  column,
  dispatchUiEvent,
  forgetHandlers,
  iconButton,
  list,
  progress,
  serialize,
  sheet,
  text,
  ui,
} from "./ui.ts"

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

  test("uses explicit keys and list item keys in paths", () => {
    const tree = column({ key: "root" }, [
      button("a", { key: "primary" }),
      list({
        items: ["x", "y"],
        keyOf: (value) => value,
        render: (value) => text(value),
      }),
    ])
    const out = serialize([tree]) as Array<{
      path: string
      children: Array<{ path: string; children?: Array<{ path: string }> }>
    }>

    expect(out[0]!.path).toBe("/root")
    expect(out[0]!.children[0]!.path).toBe("/root/primary")
    expect(out[0]!.children[1]!.path).toBe("/root/1")
    expect(out[0]!.children[1]!.children![0]!.path).toBe("/root/1/x")
    expect(out[0]!.children[1]!.children![1]!.path).toBe("/root/1/y")
  })

  test("list renders rows with stable item keys", () => {
    const node = list({
      items: [{ id: "a" }, { id: "b" }],
      keyOf: (item) => item.id,
      render: (item) => text(item.id),
    })

    expect(node.children?.length).toBe(2)
    expect(node.props.itemKeys).toEqual(["a", "b"])
  })

  test("new components forward their events", () => {
    const seen: string[] = []

    const bar = appBar({ title: "Tasks", onBack: () => seen.push("back") })
    const remove = chip("tag", { onRemove: () => seen.push("remove") })
    const editor = sheet({ title: "Edit", onClose: () => seen.push("close") })
    const action = iconButton("add", { onClick: () => seen.push("click") })

    dispatchUiEvent(bar.id, "back", undefined)
    dispatchUiEvent(remove.id, "remove", undefined)
    dispatchUiEvent(editor.id, "close", undefined)
    dispatchUiEvent(action.id, "click", undefined)

    expect(seen).toEqual(["back", "remove", "close", "click"])
  })

  test("progress defaults to indeterminate", () => {
    expect(progress().props.indeterminate).toBe(true)
    expect(progress({ value: 0.5 }).props.indeterminate).toBe(false)
  })
})
