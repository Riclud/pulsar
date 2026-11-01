import { describe, expect, test } from "bun:test"
import { App, Store, WindowHandle } from "./app.ts"
import { registerCapability } from "./caps.ts"

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
