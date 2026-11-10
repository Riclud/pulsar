import { describe, expect, test } from "bun:test"
import {
  Text,
  VirtualList,
  createUiRoot,
  dispatchWindowEvent,
  renderUiRoot,
  serialize,
  setWindowHandlers,
  updateUiRoot,
  collectUiHandlers,
} from "./ui.ts"

const items = Array.from({ length: 500 }, (_, index) => ({ id: `r${index}`, label: `Item ${index}` }))

const setup = (onEndReached?: () => void) => {
  const rendered: number[] = []

  const root = createUiRoot(
    () => [
      VirtualList({
        key: "list",
        items,
        rowHeight: 30,
        keyOf: (item) => item.id,
        onEndReached,
        render: (item, index) => {
          rendered.push(index)

          return Text({ key: item.id, text: item.label })
        },
      }),
    ],
    () => {},
  )

  const tree = renderUiRoot(root)

  setWindowHandlers("main", collectUiHandlers(tree).routes)

  return { root, rendered, tree }
}

const listOf = (tree: ReturnType<typeof setup>["tree"]) =>
  serialize(tree)[0] as { props: Record<string, unknown>; children: unknown[]; events: string[] }

describe("VirtualList with render", () => {
  test("renders only the first rows of a long list", () => {
    const { rendered, tree } = setup()
    const node = listOf(tree)

    expect(rendered.length).toBeLessThan(40)
    expect(node.children).toHaveLength(rendered.length)
    expect(node.props).toMatchObject({ count: 500, start: 0, rowHeight: 30 })
    expect(node.events).toEqual(["range"])
  })

  test("a visible range far down moves the rendered window", () => {
    const { root, rendered, tree } = setup()
    const path = (listOf(tree) as unknown as { path?: string }).path ?? ""

    rendered.length = 0

    dispatchWindowEvent("main", path || "/list", "range", { first: 300, last: 310 })

    const update = updateUiRoot(root)

    expect(update).not.toBeNull()
    expect(Math.min(...rendered)).toBeGreaterThanOrEqual(290)
    expect(Math.max(...rendered)).toBeLessThanOrEqual(320)
    expect(rendered.length).toBeLessThan(40)
  })

  test("a range inside the rendered window renders nothing again", () => {
    const { root, rendered, tree } = setup()
    const path = (listOf(tree) as unknown as { path?: string }).path ?? "/list"

    rendered.length = 0

    dispatchWindowEvent("main", path, "range", { first: 2, last: 12 })
    updateUiRoot(root)

    expect(rendered).toEqual([])
  })

  test("onEndReached fires once for the same length", () => {
    let reached = 0
    const { root, tree } = setup(() => reached++)
    const path = (listOf(tree) as unknown as { path?: string }).path ?? "/list"

    dispatchWindowEvent("main", path, "range", { first: 480, last: 499 })
    updateUiRoot(root)
    dispatchWindowEvent("main", path, "range", { first: 481, last: 499 })
    updateUiRoot(root)

    expect(reached).toBe(1)
  })
})
