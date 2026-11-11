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

describe("onDropFiles", () => {
  test("passes the paths and the position", () => {
    const seen: unknown[] = []
    const node = Box({ onDropFiles: (files, at) => seen.push([files, at]) })

    expect(node.events).toEqual(["dropFiles"])

    dispatchUiEvent(node.id, "dropFiles", { files: ["/a.txt"], x: 1, y: 2 })

    expect(seen).toEqual([[["/a.txt"], { x: 1, y: 2 }]])
  })
})
