import { describe, expect, test } from "bun:test"
import { Box, dispatchUiEvent } from "./ui.ts"

describe("onContextMenu", () => {
  test("lists the event and passes the position", () => {
    const seen: Array<{ x: number; y: number }> = []
    const node = Box({ onContextMenu: (position) => seen.push(position) })

    expect(node.events).toEqual(["contextMenu"])

    dispatchUiEvent(node.id, "contextMenu", { x: 12, y: 34 })

    expect(seen).toEqual([{ x: 12, y: 34 }])
  })
})
