import { expect, test } from "bun:test"
import { App } from "./app.ts"
import { signal } from "./reactive.ts"
import { Column, Text, component, dispatchUiEvent, type UiNode } from "./ui.ts"

const tick = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

test("a parent rerender keeps the handlers of the children it reuses", async () => {
  const app = new App()
  const label = signal("a")
  const taps: string[] = []
  const children: UiNode[] = []

  app.onSendUi = () => {}
  app.onSendUiPatch = () => {}

  const Child = component<{ key: string }>(() => {
    const node = Text({ text: "child", onLayout: () => taps.push("child") })

    children.push(node)

    return node
  })
  const Parent = component(() => {
    return Column({ key: "page" }, Text({ text: label.get() }), Child({ key: "c" }))
  })

  app.renderWindow("main", () => Column({ key: "root" }, Parent({})))

  label.set("b")
  await tick()

  expect(children.length).toBe(1)

  dispatchUiEvent(children[0]!.id, "layout", { width: 1, height: 1 })

  expect(taps).toEqual(["child"])
})

test("a full rerender forgets the handlers of removed nodes and keeps the rest", async () => {
  const app = new App()
  const names = signal(["a", "b", "c"])
  const taps: string[] = []
  const nodes = new Map<string, UiNode>()

  app.onSendUi = () => {}

  app.renderWindow("main", () => {
    return Column(
      { key: "root" },
      ...names.get().map((name) => {
        const node = Text({ key: name, text: name, onLayout: () => taps.push(name) })

        nodes.set(name, node)

        return node
      }),
    )
  })

  const before = new Map(nodes)

  names.set(["a", "c", "d"])
  await tick()
  names.set(["a", "c"])
  await tick()

  const layout = { width: 1, height: 1, x: 0, y: 0 }

  dispatchUiEvent(before.get("b")!.id, "layout", layout)
  dispatchUiEvent(nodes.get("a")!.id, "layout", layout)
  dispatchUiEvent(nodes.get("c")!.id, "layout", layout)
  dispatchUiEvent(nodes.get("d")!.id, "layout", layout)

  expect(taps).toEqual(["a", "c"])
})
