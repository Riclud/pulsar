import { describe, expect, test } from "bun:test"
import { App, Store, WindowHandle, type MenuItem, type UiTimings } from "./app.ts"
import { registerCapability } from "./caps.ts"
import { Column, Text } from "./ui.ts"

describe("Store", () => {
  test("accepts plain JSON values", () => {
    const store = new Store()

    store.set("a", 1)
    store.set("b", "x")
    store.set("c", true)
    store.set("d", null)
    store.set("e", [1, 2, { f: "g" }])
    expect(store.get("a")).toBe(1)
    expect(store.get("e")).toEqual([1, 2, { f: "g" }])
  })

  test("notifies after the new value is visible", () => {
    const store = new Store()
    const seen: unknown[] = []

    store.subscribe(() => seen.push(store.get("count")))
    store.set("count", 1)
    store.set("count", 2)
    store.set("count", 2)

    expect(seen).toEqual([1, 2])
  })

  test("rejects non-serializable values", () => {
    const store = new Store()

    expect(() => store.set("fn", () => {})).toThrow(/function/)
    expect(() => store.set("map", new Map())).toThrow(/Map/)
    expect(() => store.set("date", new Date())).toThrow(/Date/)
    expect(() => store.set("big", 1n)).toThrow(/bigint/)
    expect(() => store.set("undef", undefined)).toThrow(/undefined/)
    expect(() => store.set("nan", NaN)).toThrow(/finite/)
  })

  test("rejects circular references", () => {
    const store = new Store()
    const obj: Record<string, unknown> = {}

    obj.self = obj
    expect(() => store.set("loop", obj)).toThrow(/circular/)
  })

  test("tracks changes and removals", () => {
    const store = new Store()

    store.set("a", 1)
    store.takePatch()
    store.set("a", 2)
    store.delete("a")
    store.set("b", 3)
    const patch = store.takePatch()

    expect(patch.removed).toEqual(["a"])
    expect(patch.changed).toEqual({ b: 3 })
  })

  test("compares objects by reference", () => {
    const store = new Store()
    const value = { a: 1 }
    let changes = 0

    store.set("value", value)
    store.subscribe(() => changes++)

    store.set("value", value)
    expect(changes).toBe(0)

    store.set("value", { a: 1 })
    expect(changes).toBe(1)
  })

  test("still notifies when a key appears for the first time", () => {
    const store = new Store()
    let notified = 0

    store.subscribe(() => notified++)
    store.set("late", null)
    store.set("late", null)
    store.set("dynamic", { ready: true })

    expect(notified).toBe(2)
    expect(store.takePatch().changed).toEqual({ late: null, dynamic: { ready: true } })
  })
})

describe("Store batch", () => {
  test("notifies once after the last mutation", () => {
    const store = new Store()
    let calls = 0

    store.subscribe(() => calls++)

    store.batch(() => {
      store.set("a", 1)
      store.set("b", 2)
      store.set("a", 3)
    })

    expect(calls).toBe(1)
    expect(store.get("a")).toBe(3)
    expect(store.get("b")).toBe(2)
  })
})

describe("App renders", () => {
  test("coalesces store changes into one render per tick", async () => {
    const app = new App()
    const trees: unknown[] = []

    app.onSendUi = (_label, tree) => {
      trees.push(tree)
    }

    app.window("main").render(() => [Text({ text: String(app.store.get("a") ?? "") })])

    const base = trees.length

    app.store.set("a", 1)
    app.store.set("b", 2)

    expect(trees.length).toBe(base)

    await Promise.resolve()

    expect(trees.length).toBe(base + 1)
  })
})

describe("App menu", () => {
  test("sends the menu once the runtime is wired", () => {
    const app = new App()
    const seen: MenuItem[][] = []

    app.setMenu([{ label: "File", items: [{ id: "save", label: "Save", shortcut: "Ctrl+S" }] }])
    expect(seen).toHaveLength(0)

    app.onSetMenu = (items) => seen.push(items)
    app.flushMenu()

    expect(seen).toHaveLength(1)
    expect(seen[0]![0]!.label).toBe("File")
    expect(seen[0]![0]!.items![0]!.id).toBe("save")
  })
})

describe("WindowHandle", () => {
  test("sends commands through the window capability", async () => {
    const seen: unknown[] = []

    registerCapability("window", (params) => {
      seen.push(params)

      return Promise.resolve(true)
    })

    await new WindowHandle("second").setTitle("Hi")
    await new WindowHandle("second").close()

    expect(seen[0]).toEqual({ label: "second", action: "setTitle", title: "Hi" })
    expect(seen[1]).toEqual({ label: "second", action: "close" })
  })
})

describe("App recent documents", () => {
  test("queues calls made before the runtime wires its handlers", () => {
    const app = new App()
    const ops: string[] = []

    app.addRecentDocument("/tmp/a.txt")
    app.clearRecentDocuments()

    app.onAddRecentDocument = (path) => ops.push(`add:${path}`)
    app.onClearRecentDocuments = () => ops.push("clear")
    app.flushRecentDocuments()

    expect(ops).toEqual(["add:/tmp/a.txt", "clear"])
  })
})

describe("App windows", () => {
  test("createWindow registers the window and notifies the runtime", () => {
    const app = new App()
    const created: unknown[] = []

    app.onCreateWindow = (config) => created.push(config)

    const handle = app.createWindow({ ui: "ui/panel.qml", title: "Panel" })

    expect(handle.label).toBe("window-2")
    expect(app.windows.map((w) => w.label)).toContain("window-2")
    expect(created).toEqual([{ ui: "ui/panel.qml", title: "Panel", label: "window-2" }])
  })

  test("send forwards the event and target to the runtime", () => {
    const app = new App()
    const sent: Array<[string, unknown, string]> = []

    app.onSend = (event, payload, target) => sent.push([event, payload, target])

    app.send("ping", "pong")
    app.window("main").emit("hi", { n: 1 })

    expect(sent[0]).toEqual(["ping", "pong", "*"])
    expect(sent[1]).toEqual(["hi", { n: 1 }, "main"])
  })
})

describe("ui timings", () => {
  test("reports the phases of a flush", () => {
    const app = new App()
    const timings: UiTimings[] = []

    app.onUiTimings = (value) => timings.push(value)
    app.onSendUi = () => {}
    app.renderWindow("main", () => Column({}, Text({ text: "a" })))

    expect(timings.length).toBe(1)
    expect(timings[0]?.label).toBe("main")
    expect(timings[0]?.patches).toBe(-1)
    expect(timings[0]?.build).toBeGreaterThanOrEqual(0)
    expect(timings[0]?.send).toBeGreaterThanOrEqual(0)
  })
})
