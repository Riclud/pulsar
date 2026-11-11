import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { normalizeKeys, shortcutInternals, shortcuts } from "./shortcuts.ts"
import { setUiCommandSink, type UiCommand } from "./ui.ts"

const sent: UiCommand[] = []

const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  sent.length = 0
  shortcutInternals.reset()
  setUiCommandSink((command) => sent.push(command))
})

afterEach(() => setUiCommandSink(null))

describe("shortcuts", () => {
  test("keys are written the way Qt reads them", () => {
    expect(normalizeKeys("mod+k")).toBe("Ctrl+K")
    expect(normalizeKeys("Cmd + Shift + p")).toBe("Ctrl+Shift+P")
    expect(normalizeKeys("Option+Left")).toBe("Alt+Left")
    expect(normalizeKeys("esc")).toBe("Escape")
    expect(normalizeKeys("F5")).toBe("F5")
  })

  test("registrations made together go to the host as one list", async () => {
    shortcuts.register("Ctrl+K", () => {})
    shortcuts.register("Ctrl+Shift+P", () => {}, { window: "settings", repeat: true })

    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      command: "shortcuts",
      shortcuts: [
        { id: expect.any(Number), keys: "Ctrl+K", window: undefined, repeat: undefined },
        { id: expect.any(Number), keys: "Ctrl+Shift+P", window: "settings", repeat: true },
      ],
    })
  })

  test("the host's report runs the matching handler", async () => {
    const seen: string[] = []

    shortcuts.register("Ctrl+K", () => seen.push("k"))
    shortcuts.register("F5", () => seen.push("f5"))

    await settle()

    const list = (sent[0] as { shortcuts: Array<{ id: number; keys: string }> }).shortcuts

    shortcutInternals.run(list.find((item) => item.keys === "F5")!.id)
    shortcutInternals.run(list.find((item) => item.keys === "Ctrl+K")!.id)
    shortcutInternals.run(9999)

    expect(seen).toEqual(["f5", "k"])
  })

  test("removing a shortcut sends the shorter list and stops its handler", async () => {
    const seen: string[] = []
    const remove = shortcuts.register("Ctrl+K", () => seen.push("k"))

    await settle()

    const id = (sent[0] as { shortcuts: Array<{ id: number }> }).shortcuts[0]!.id

    remove()
    remove()
    await settle()

    shortcutInternals.run(id)

    expect(seen).toEqual([])
    expect(sent.at(-1)).toEqual({ command: "shortcuts", shortcuts: [] })
  })

  test("flush repeats the list for a host that connected late", async () => {
    shortcuts.register("Ctrl+K", () => {})
    await settle()

    sent.length = 0
    shortcutInternals.flush()

    expect(sent).toHaveLength(1)
  })
})
