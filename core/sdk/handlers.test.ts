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
