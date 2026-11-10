import { describe, expect, test } from "bun:test"
import { Video, dispatchUiEvent, serialize } from "./ui.ts"

describe("Video", () => {
  test("its options become props and its handlers become events", () => {
    const node = Video({
      source: "a.mp4",
      muted: true,
      loop: true,
      autoplay: true,
      paused: false,
      fillMode: "cover",
      onEnded: () => {},
    })

    expect(node.type).toBe("video")
    expect(node.props).toEqual({
      source: "a.mp4",
      muted: true,
      loop: true,
      autoplay: true,
      paused: false,
      fillMode: "cover",
    })
    expect(node.events).toEqual(["ended"])
    expect((serialize([node])[0] as { type: string }).type).toBe("video")
  })

  test("ended and error reach their handlers", () => {
    const seen: string[] = []
    const node = Video({
      source: "a.mp4",
      onEnded: () => seen.push("ended"),
      onError: (message) => seen.push(`error:${message}`),
    })

    dispatchUiEvent(node.id, "ended", undefined)
    dispatchUiEvent(node.id, "error", "no such file")

    expect(seen).toEqual(["ended", "error:no such file"])
  })
})
