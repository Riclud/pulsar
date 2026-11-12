import { expect, test } from "bun:test"
import { App } from "./app.ts"
import { signal } from "./reactive.ts"
import { Box, Column, For, Text, component, dispatchUiEvent, type UiNode } from "./ui.ts"

const tick = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

test("a parent rerender keeps the handlers of the children it reuses", async () => {
  const app = new App()
  const label = signal("a")
  const taps: string[] = []
  const children: UiNode[] = []

  app.onSendUi = () => {}
  app.onSendUiPatch = () => {}

  const Child = component<{ key: string }>(() => {
    const node = Text({ text: "child", onLayout: () => taps.push("child") })

    children.push(node)

    return node
  })
  const Parent = component(() => {
    return Column({ key: "page" }, Text({ text: label.get() }), Child({ key: "c" }))
  })

  app.renderWindow("main", () => Column({ key: "root" }, Parent({})))

  label.set("b")
  await tick()

  expect(children.length).toBe(1)

  dispatchUiEvent(children[0]!.id, "layout", { width: 1, height: 1 })

  expect(taps).toEqual(["child"])
})

test("a full rerender forgets the handlers of removed nodes and keeps the rest", async () => {
  const app = new App()
  const names = signal(["a", "b", "c"])
  const taps: string[] = []
  const nodes = new Map<string, UiNode>()

  app.onSendUi = () => {}

  app.renderWindow("main", () => {
    return Column(
      { key: "root" },
      ...names.get().map((name) => {
        const node = Text({ key: name, text: name, onLayout: () => taps.push(name) })

        nodes.set(name, node)

        return node
      }),
    )
  })

  const before = new Map(nodes)

  names.set(["a", "c", "d"])
  await tick()
  names.set(["a", "c"])
  await tick()

  const layout = { width: 1, height: 1, x: 0, y: 0 }

  dispatchUiEvent(before.get("b")!.id, "layout", layout)
  dispatchUiEvent(nodes.get("a")!.id, "layout", layout)
  dispatchUiEvent(nodes.get("c")!.id, "layout", layout)
  dispatchUiEvent(nodes.get("d")!.id, "layout", layout)

  expect(taps).toEqual(["a", "c"])
})

type Row = { ID: string; label: string }

type Routes = Record<string, Record<string, (value: unknown) => void>>

const routesOf = (app: App): Routes => {
  return (app as unknown as { sentRoutes: Map<string, Routes> }).sentRoutes.get("main") ?? {}
}

const clickAll = (routes: Routes, log: string[]): void => {
  for (const path of Object.keys(routes).sort()) routes[path]!.click?.(null)

  log.push("done")
}

const buildRows = (rows: Row[], hits: string[], inComponent: boolean): UiNode => {
  const render = (row: Row) => {
    const onClick = () => hits.push(`${row.ID}:${row.label}`)

    return Column({ key: row.ID }, Box({ onClick }, Text({ text: row.label })))
  }
  const list = () => For({ each: rows, keyOf: (row: Row) => row.ID, memo: true, render })

  return inComponent ? component(() => list)({}) : Column({}, list())
}

const settle = async (rows: Row[], inComponent: boolean) => {
  const app = new App()
  const hits: string[] = []

  app.onSendUi = () => {}
  app.onSendUiPatch = () => {}
  app.renderWindow("main", () => buildRows(rows, hits, inComponent))

  await tick()

  return { routes: routesOf(app), hits }
}

for (const inComponent of [false, true]) {
  test(`handler tables after keyed list edits match a fresh render (${inComponent ? "component" : "root"})`, async () => {
    const app = new App()
    const rows = signal<Row[]>(Array.from({ length: 12 }, (_, i) => ({ ID: `r${i}`, label: `t${i}` })))
    const hits: string[] = []
    let seed = 7

    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648

      return seed
    }

    app.onSendUi = () => {}
    app.onSendUiPatch = () => {}
    app.renderWindow("main", () => {
      return inComponent
        ? Column({}, component(() => () => buildRows(rows.get(), hits, false))({}))
        : buildRows(rows.get(), hits, false)
    })

    await tick()

    for (let step = 0; step < 40; step++) {
      const list = [...rows.peek()]
      const at = next() % list.length
      const kind = next() % 5

      if (kind === 0) list[at] = { ...list[at]!, label: `c${step}` }
      if (kind === 1) list.splice(at, 1)
      if (kind === 2) list.splice(at, 0, { ID: `n${step}`, label: `n${step}` })
      if (kind === 3) list.reverse()
      if (kind === 4) list.push(list.shift()!)

      if (list.length === 0) list.push({ ID: "last", label: "last" })

      rows.set(list)
      await tick()

      const fresh = await settle(list, false)
      const have = routesOf(app)

      // The component variant nests the list one level deeper than the fresh render.
      const tails = (routes: Routes) =>
        Object.keys(routes)
          .map((path) => path.split("/").slice(-2).join("/"))
          .sort()

      expect(tails(have)).toEqual(tails(fresh.routes))

      hits.length = 0
      clickAll(have, [])
      clickAll(fresh.routes, [])

      expect(hits.sort()).toEqual(fresh.hits.sort())
    }
  })
}
