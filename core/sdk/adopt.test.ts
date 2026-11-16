import { expect, test } from "bun:test"
import { App } from "./app.ts"
import { signal } from "./reactive.ts"
import {
  Box,
  Card,
  Column,
  Row,
  Text,
  component,
  dispatchUiEvent,
  dispatchWindowEvent,
  type UiNode,
  type UiPatch,
} from "./ui.ts"

type Sent = {
  path: string
  type: string
  props: Record<string, unknown>
  events?: string[]
  children?: Sent[]
}

const tick = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const find = (nodes: Sent[], test: (node: Sent) => boolean): Sent | undefined => {
  for (const node of nodes) {
    if (test(node)) return node

    const inner = find(node.children ?? [], test)

    if (inner) return inner
  }

  return undefined
}

const setup = () => {
  const app = new App()
  const sent: { tree: Sent[]; patches: UiPatch[][] } = { tree: [], patches: [] }

  app.onSendUi = (_label, tree) => {
    sent.tree = tree as Sent[]
  }
  app.onSendUiPatch = (_label, patches) => {
    sent.patches.push(patches)
  }

  return { app, sent }
}

test("a row that only changes `visible` sends one shallow patch and keeps its buttons current", async () => {
  const { app, sent } = setup()
  const hidden = signal(false)
  const taps: string[] = []
  const buttons: UiNode[] = []

  let render = 0

  const Line = component<{ key: string; name: string; visible: boolean }>(({ name, visible }) => {
    const made = ++render

    const button = Box(
      {
        key: "button",
        width: 20,
        height: 20,
        pressed: { color: "#333", scale: 0.9 },
        onClick: () => taps.push(`${name}@${made}`),
      },
      Text({ text: "go" }),
    )

    buttons.push(button)

    return Card(
      { visible, hover: { color: "#222" }, onClick: () => taps.push(`row ${name}@${made}`) },
      Row({ gap: 4 }, Text({ text: name }), button),
    )
  })

  const List = component(() => {
    return () =>
      Column(
        { key: "list" },
        Line({ key: "a", name: "a", visible: !hidden.get() }),
        Line({ key: "b", name: "b", visible: true }),
      )
  })

  app.renderWindow("main", () => Column({ key: "root" }, List({})))

  const button = find(sent.tree, (node) => node.path.endsWith("/a/0/button"))!
  const row = find(sent.tree, (node) => node.path.endsWith("/list/a"))!

  expect(button.events).toEqual(["click"])

  hidden.set(true)
  await tick()

  // Only the row itself differs; `b` did not render again at all.
  expect(render).toBe(3)
  expect(sent.patches).toHaveLength(1)
  expect(sent.patches[0]).toHaveLength(1)
  expect(sent.patches[0]![0]!.path).toBe(row.path)
  expect(sent.patches[0]![0]!.shallow).toBe(true)
  expect((sent.patches[0]![0]!.node.props as { visible: boolean }).visible).toBe(false)

  // The host still knows the button by its first ID and path; both run the closure of the last render.
  dispatchWindowEvent("main", button.path, "click", undefined)
  dispatchUiEvent(buttons[0]!.id, "click", undefined)
  dispatchWindowEvent("main", row.path, "click", undefined)

  expect(taps).toEqual(["a@3", "a@3", "row a@3"])

  // The node the second render made for the button was dropped, and its callbacks with it.
  dispatchUiEvent(buttons[2]!.id, "click", undefined)

  expect(taps).toHaveLength(3)

  hidden.set(false)
  await tick()

  dispatchWindowEvent("main", button.path, "click", undefined)

  expect(taps.at(-1)).toBe("a@4")
  expect(sent.patches).toHaveLength(2)
  expect(sent.patches[1]).toHaveLength(1)
})

test("a rerender that changes something inside sends it, and keeps what is equal around it", async () => {
  const { app, sent } = setup()
  const count = signal(1)
  const taps: number[] = []

  const Counter = component(() => {
    return () => {
      const value = count.get()

      return Column(
        { key: "counter" },
        Text({ key: "value", text: `count ${value}` }),
        Box({ key: "more", transition: { duration: 120 }, onClick: () => taps.push(value) }, Text({ text: "more" })),
        Box({ key: "tone", color: value > 2 ? "#f00" : "#0f0", hover: { color: "#fff" } }),
      )
    }
  })

  app.renderWindow("main", () => Column({ key: "root" }, Counter({})))

  const more = find(sent.tree, (node) => node.path.endsWith("/more"))!

  count.set(2)
  await tick()

  expect(sent.patches[0]!.map((patch) => patch.path.split("/").at(-1))).toEqual(["value"])

  dispatchWindowEvent("main", more.path, "click", undefined)

  expect(taps).toEqual([2])

  count.set(3)
  await tick()

  // A nested prop object with the same values is equal; a different colour is not.
  expect(sent.patches[1]!.map((patch) => patch.path.split("/").at(-1))).toEqual(["value", "tone"])

  dispatchWindowEvent("main", more.path, "click", undefined)

  expect(taps).toEqual([2, 3])
})

test("a child that appears, changes its events or moves is not mistaken for the old one", async () => {
  const { app, sent } = setup()
  const step = signal(0)
  const taps: string[] = []

  const Page = component(() => {
    return () => {
      const at = step.get()

      return Column(
        { key: "page" },
        at === 1 ? Text({ key: "extra", text: "extra" }) : null,
        at === 2
          ? Box({ key: "item", width: 10 }, Text({ text: "item" }))
          : Box({ key: "item", width: 10, onClick: () => taps.push(`item@${at}`) }, Text({ text: "item" })),
      )
    }
  })

  app.renderWindow("main", () => Column({ key: "root" }, Page({})))

  const item = find(sent.tree, (node) => node.path.endsWith("/item"))!

  step.set(1)
  await tick()
  dispatchWindowEvent("main", item.path, "click", undefined)

  expect(taps).toEqual(["item@1"])

  step.set(2)
  await tick()
  dispatchWindowEvent("main", item.path, "click", undefined)

  // Without onClick the node has no click event, and the old callback is gone with it.
  expect(taps).toEqual(["item@1"])
  expect(sent.patches.at(-1)!.some((patch) => patch.path === item.path)).toBe(true)

  step.set(3)
  await tick()
  dispatchWindowEvent("main", item.path, "click", undefined)

  expect(taps).toEqual(["item@1", "item@3"])
})
