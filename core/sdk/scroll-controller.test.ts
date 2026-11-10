import { afterEach, describe, expect, test } from "bun:test"
import {
  Page,
  Scroll,
  Text,
  createScrollController,
  list,
  serialize,
  setUiCommandSink,
  type UiCommand,
  type UiNode,
} from "./ui.ts"

interface Serialized {
  type: string
  props: Record<string, unknown>
  children?: Serialized[]
}

const one = (node: UiNode): Serialized => serialize([node])[0] as Serialized

const sent: UiCommand[] = []

setUiCommandSink((command) => sent.push(command))

afterEach(() => {
  sent.length = 0
})

describe("scroll controller", () => {
  test("every controller has its own id", () => {
    expect(createScrollController().id).not.toBe(createScrollController().id)
  })

  test("scrollTo, scrollToStart and scrollToEnd send commands", () => {
    const controller = createScrollController()

    controller.scrollTo(400)
    controller.scrollTo(-20, { animated: true })
    controller.scrollToStart()
    controller.scrollToEnd({ animated: true })

    expect(sent).toEqual([
      { command: "scrollTo", controller: controller.id, position: 400, animated: false },
      { command: "scrollTo", controller: controller.id, position: 0, animated: true },
      { command: "scrollTo", controller: controller.id, position: 0, animated: false },
      { command: "scrollToEnd", controller: controller.id, position: undefined, animated: true },
    ])
  })

  test("Scroll, Page and a top-level list mark their node with the controller", () => {
    const controller = createScrollController()
    const scrolled = one(Scroll({ controller }, Text({ text: "a" })))
    const paged = one(Page({ controller }, Text({ text: "a" })))
    const listed = one(list({ items: [1], render: (item) => Text({ text: String(item) }), controller }))

    expect(scrolled.props.scrollController).toBe(controller.id)
    expect(scrolled.props.controller).toBeUndefined()
    expect(paged.children?.find((child) => child.type === "scroll")?.props.scrollController).toBe(controller.id)
    expect(listed.props.scrollController).toBe(controller.id)
  })

  test("without a controller nothing is added", () => {
    expect(one(Scroll({}, Text({ text: "a" }))).props).not.toHaveProperty("scrollController")
  })
})
