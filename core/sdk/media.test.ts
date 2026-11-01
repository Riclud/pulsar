import { beforeEach, describe, expect, test } from "bun:test"
import { App } from "./app.ts"
import { registerCapability, setPermissionGate } from "./caps.ts"
import { MediaManager, media } from "./media.ts"

describe("media", () => {
  beforeEach(() => {
    setPermissionGate(null)
  })

  test("loads a playlist and forwards controls", () => {
    const app = new App({ label: "main" })
    const actions: Array<Record<string, unknown>> = []

    registerCapability("media", (async (params: Record<string, unknown>) => {
      actions.push(params)

      return true
    }) as never)

    media.load([
      { source: "/music/one.mp3", title: "One", artist: "A" },
      { source: "/music/two.mp3", title: "Two" },
    ])

    expect(actions[0]).toMatchObject({
      action: "open",
      source: "/music/one.mp3",
      title: "One",
      artist: "A",
    })
    expect(media.state().state).toBe("loading")
    expect(media.playlist().length).toBe(2)

    media.play()
    expect(actions.at(-1)).toEqual({ action: "play" })

    media.seek(1200)
    expect(actions.at(-1)).toEqual({ action: "seek", position: 1200 })

    media.setRate(1.5)
    expect(actions.at(-1)).toEqual({ action: "rate", rate: 1.5 })

    media.setVolume(2)
    expect(actions.at(-1)).toEqual({ action: "volume", volume: 1 })
  })

  test("tracks host state and notifies listeners", () => {
    const app = new App({ label: "main" })
    const seen: string[] = []
    const manager = new MediaManager(app)

    manager.on((snapshot) => seen.push(`${snapshot.state}:${snapshot.position}`))

    manager.load([{ source: "a", title: "A" }])
    manager.play()

    app.dispatchEvent("media", {
      state: "playing",
      position: 500,
      duration: 10_000,
      rate: 1,
      volume: 1,
    })

    expect(manager.state()).toMatchObject({
      state: "playing",
      position: 500,
      duration: 10_000,
      playing: true,
    })
    expect(seen.at(-1)).toBe("playing:500")
  })

  test("playlist next/previous and lockscreen commands advance tracks", () => {
    const app = new App({ label: "main" })
    const actions: Array<Record<string, unknown>> = []

    registerCapability("media", (async (params: Record<string, unknown>) => {
      actions.push(params)

      return true
    }) as never)

    const manager = new MediaManager(app)

    manager.load([{ source: "one" }, { source: "two" }, { source: "three" }])
    manager.next()

    expect(manager.state().source).toBe("two")

    app.dispatchEvent("media-command", { command: "next" })
    expect(manager.state().source).toBe("three")

    app.dispatchEvent("media-command", { command: "next" })
    expect(manager.state().source).toBe("one")

    app.dispatchEvent("media-command", { command: "previous" })
    expect(manager.state().source).toBe("three")
  })
})
