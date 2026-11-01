import { describe, expect, test } from "bun:test"
import {
  Button,
  Card,
  Checkbox,
  Column,
  For,
  Header,
  Input,
  Modal,
  Text,
  TextField,
  When,
  appBar,
  bind,
  button,
  checkbox,
  chip,
  column,
  defineComponent,
  dispatchUiEvent,
  forgetHandlers,
  iconButton,
  list,
  progress,
  serialize,
  sheet,
  text,
  textInput,
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

  test("multiline input renders a textArea node", () => {
    const single = textInput({ placeholder: "one" })
    const multi = textInput({ multiline: true, lines: 4 })

    expect(single.type).toBe("textInput")
    expect(multi.type).toBe("textArea")
    expect(multi.props.lines).toBe(4)
  })

  test("text input forwards submit and focus events", () => {
    const seen: string[] = []
    const node = textInput({
      onSubmitted: (value) => seen.push(`submit:${value}`),
      onFocus: () => seen.push("focus"),
      onBlur: () => seen.push("blur"),
    })

    dispatchUiEvent(node.id, "submit", "hello")
    dispatchUiEvent(node.id, "focus", undefined)
    dispatchUiEvent(node.id, "blur", undefined)

    expect(seen).toEqual(["submit:hello", "focus", "blur"])
  })

  test("selectable text uses a text editor node", () => {
    expect(text({ text: "copy me", selectable: true }).type).toBe("selectableText")
    expect(text("plain").type).toBe("text")
  })
})

describe("qml-like components", () => {
  test("flattens variadic and array children and drops empty ones", () => {
    const tree = Column({}, Text({}, "a"), null, false, [Text({}, "b")])

    expect(tree.children?.map((child) => child.type)).toEqual(["text", "text"])
  })

  test("resolves bindings when the tree is serialized", () => {
    let count = 0
    const tree = Header({ title: bind(() => `Count ${count}`) })

    count = 3

    const out = serialize([tree]) as Array<{ props: Record<string, unknown> }>

    expect(out[0]!.props.title).toBe("Count 3")
  })

  test("For builds a keyed list from a binding", () => {
    const tasks = [{ id: "a" }, { id: "b" }]
    const node = For({
      each: bind(() => tasks),
      keyOf: (task) => task.id,
      render: (task) => Text({}, task.id),
    })

    expect(node.type).toBe("list")
    expect(node.children?.length).toBe(2)
    expect(node.props.itemKeys).toEqual(["a", "b"])
  })

  test("When returns a branch or null", () => {
    const shown = When({ test: true, then: () => Text({}, "yes"), else: () => Text({}, "no") })
    const hidden = When({ test: false, then: () => Text({}, "yes") })

    expect((shown as { props: Record<string, unknown> }).props.text).toBe("yes")
    expect(hidden).toBeNull()
  })

  test("web-named components map to the right nodes", () => {
    const row = Card({ padding: 12 }, Button({}, "Save"), Input({ placeholder: "Name" }), Checkbox({ label: "Done" }))

    expect(row.type).toBe("card")
    expect(row.children?.map((child) => child.type)).toEqual(["button", "textInput", "checkbox"])
    expect(Header({ title: "Tasks" }).type).toBe("appBar")
    expect(Modal({ title: "Edit" }).type).toBe("sheet")
    expect(TextField({ placeholder: "x" }).type).toBe("textInput")
  })

  test("defineComponent passes props and children", () => {
    const Row = defineComponent<{ label: string }>(({ label }, ...children) => Column({}, Text({}, label), ...children))
    const node = Row({ label: "Title" }, Text({}, "Body"))

    expect(node.children?.length).toBe(2)
  })
})
