import { describe, expect, test } from "bun:test"
import { Box, Text, box, dispatchUiEvent } from "./ui.ts"

describe("visibility events", () => {
  test("a node lists the events it listens to", () => {
    const node = Box({ onVisible: () => {}, onEnterViewport: () => {}, onLeaveViewport: () => {} })

    expect(node.events).toEqual(["visible", "enterViewport", "leaveViewport"])
    expect(node.props).not.toHaveProperty("onVisible")
  })

  test("a node without them has no events", () => {
    expect(Text({ text: "a" }).events).toBeUndefined()
  })

  test("the host's events reach the handlers", () => {
    const seen: string[] = []

    const node = box({
      onVisible: (visible) => seen.push(`visible:${visible}`),
      onEnterViewport: () => seen.push("enter"),
      onLeaveViewport: () => seen.push("leave"),
    })

    dispatchUiEvent(node.id, "visible", true)
    dispatchUiEvent(node.id, "enterViewport", undefined)
    dispatchUiEvent(node.id, "visible", false)
    dispatchUiEvent(node.id, "leaveViewport", undefined)

    expect(seen).toEqual(["visible:true", "enter", "visible:false", "leave"])
  })
})
