import { describe, expect, test } from "bun:test"
import { App } from "./app.ts"
import { computed, createState, effect, signal } from "./reactive.ts"
import {
  Column,
  For,
  KeepAlive,
  Row,
  Text,
  collectUiHandlers,
  component,
  dispatchWindowEvent,
  onCleanup,
  onMount,
  type UiPatch,
} from "./ui.ts"

const tick = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const harness = () => {
  const app = new App()
  const trees: unknown[][] = []
  const patches: UiPatch[][] = []

  app.onSendUi = (_label, tree) => trees.push(tree)
  app.onSendUiPatch = (_label, sent) => patches.push(sent)

  return { app, trees, patches }
}

describe("signals", () => {
  test("computed follows its source lazily", () => {
    const count = signal(1)
    let runs = 0
    const double = computed(() => {
      runs++

      return count.get() * 2
    })

    expect(runs).toBe(0)
    expect(double.get()).toBe(2)

    count.set(2)

    expect(double.get()).toBe(4)
    expect(runs).toBe(2)
  })

  test("effect reruns once per batch of changes and can stop", async () => {
    const count = signal(0)
    const seen: number[] = []
    const stop = effect(() => {
      seen.push(count.get())
    })

    count.set(1)
    count.set(2)
    await tick()

    expect(seen).toEqual([0, 2])

    stop()
    count.set(3)
    await tick()

    expect(seen).toEqual([0, 2])
  })

  test("createState tracks plain field access", async () => {
    const state = createState({ todos: [1], name: "a" })
    const seen: number[] = []

    effect(() => {
      seen.push(state.todos.length)
    })

    state.todos = [1, 2]
    await tick()

    expect(seen).toEqual([1, 2])
    expect(Object.keys(state)).toEqual(["todos", "name"])
  })
})

describe("components", () => {
  test("only the component that read a value rerenders", async () => {
    const { app, trees, patches } = harness()
    const title = signal("a")
    const body = signal("b")
    const renders = { title: 0, body: 0, root: 0 }
    const Title = component(() => {
      renders.title++

      return Text({ text: title.get() })
    })
    const Body = component(() => {
      renders.body++

      return Text({ text: body.get() })
    })

    app.renderWindow("main", () => {
      renders.root++

      return Column({ key: "root" }, Title({}), Body({}))
    })

    expect(trees.length).toBe(1)

    title.set("c")
    await tick()

    expect(renders).toEqual({ title: 2, body: 1, root: 1 })
    expect(patches.length).toBe(1)
    expect(patches[0]?.length).toBe(1)
    expect(patches[0]?.[0]?.path).toBe("/root/0")
    expect((patches[0]?.[0]?.node.props as { text: string }).text).toBe("c")

    body.set("d")
    await tick()

    expect(renders).toEqual({ title: 2, body: 2, root: 1 })
    expect(patches[1]?.[0]?.path).toBe("/root/1")
  })

  test("the store triggers only the readers of the changed key", async () => {
    const { app } = harness()
    const renders = { open: 0, query: 0 }
    const Open = component(() => {
      renders.open++

      return Text({ text: String(app.store.get("open")) })
    })
    const Query = component(() => {
      renders.query++

      return Text({ text: String(app.store.get("query")) })
    })

    app.renderWindow("main", () => Column({}, Open({}), Query({})))
    app.store.set("query", "x")
    await tick()

    expect(renders).toEqual({ open: 1, query: 2 })
  })

  test("a parent rerender skips children with equal props", async () => {
    const { app } = harness()
    const count = signal(0)
    const todo = { text: "a" }
    let renders = 0
    const Row = component<{ key: number; todo: { text: string }; onTap: () => void }>((props) => {
      renders++

      return Text({ text: props.todo.text })
    })

    app.renderWindow("main", () => {
      return Column({}, Text({ text: String(count.get()) }), Row({ key: 1, todo, onTap: () => {} }))
    })

    count.set(1)
    await tick()

    expect(renders).toBe(1)
  })

  test("setup runs once and local state survives rerenders", async () => {
    const { app, patches } = harness()
    const outer = signal(0)
    let setups = 0
    let local = signal(0)
    const Counter = component<{ label: string }>((props) => {
      const value = signal(10)

      local = value
      setups++

      return () => Text({ text: `${props.label} ${value.get()}` })
    })

    app.renderWindow("main", () => Column({}, Counter({ label: `l${outer.get()}` })))

    local.set(11)
    await tick()
    outer.set(1)
    await tick()

    expect(setups).toBe(1)
    expect((patches.at(-1)?.[0]?.node.props as { text: string }).text).toBe("l1 11")
  })

  test("mount runs after sending and cleanup when leaving the tree", async () => {
    const { app, trees } = harness()
    const show = signal(true)
    const events: string[] = []
    const Child = component(() => {
      onMount(() => {
        events.push(`mount ${trees.length}`)

        return () => events.push("mount cleanup")
      })
      onCleanup(() => events.push("cleanup"))

      return () => Text({ text: "x" })
    })

    app.renderWindow("main", () => Column({}, show.get() ? Child({}) : null))

    expect(events).toEqual(["mount 1"])

    show.set(false)
    await tick()

    expect(events).toEqual(["mount 1", "cleanup", "mount cleanup"])
  })

  test("a partial update keeps event routes current", async () => {
    const { app } = harness()
    const count = signal(0)
    const hits: number[] = []
    const Button = component(() => {
      const value = count.get()

      return Text({ text: String(value), onLayout: () => hits.push(value) })
    })
    const tree = () => Column({ key: "root" }, Button({}))

    app.renderWindow("main", tree)
    count.set(1)
    await tick()

    const { dispatchWindowEvent } = await import("./ui.ts")

    dispatchWindowEvent("main", "/root/0", "layout", { width: 1, height: 1 })

    expect(hits).toEqual([1])
    expect(Object.keys(collectUiHandlers([Text({ text: "x" })]).routes)).toEqual([])
  })

  test("invalidateUi rerenders state the signals cannot see", async () => {
    const { app, patches } = harness()
    let external = "a"
    const Plain = component(() => Text({ text: external }))

    app.renderWindow("main", () => Column({}, Plain({})))

    external = "b"
    app.invalidateUi()
    await tick()

    expect((patches.at(-1)?.[0]?.node.props as { text: string }).text).toBe("b")
  })
})

describe("KeepAlive", () => {
  const setup = () => {
    const { app, trees, patches } = harness()
    const active = signal(false)
    const value = signal("a")
    const counts = { setup: 0, render: 0, cleanup: 0, inner: 0 }

    const Inner = component(() => {
      counts.inner++

      return Text({ text: `inner ${value.get()}` })
    })

    const Screen = component(() => {
      counts.setup++

      onCleanup(() => {
        counts.cleanup++
      })

      return () => {
        counts.render++

        return Column({}, Text({ text: value.get() }), Inner({}))
      }
    })

    const present = signal(true)

    app.window("main").render(() =>
      Column(
        { key: "root" },
        present.get() ? KeepAlive({ key: "screen", active: active.get() }, () => Screen({})) : null,
      ),
    )

    return { active, value, counts, present, trees, patches }
  }

  test("builds the content only when first shown", async () => {
    const { active, counts } = setup()

    await tick()
    expect(counts.setup).toBe(0)

    active.set(true)
    await tick()
    expect(counts.setup).toBe(1)
  })

  test("keeps the instance while hidden", async () => {
    const { active, counts } = setup()

    active.set(true)
    await tick()
    active.set(false)
    await tick()
    active.set(true)
    await tick()

    expect(counts.setup).toBe(1)
    expect(counts.cleanup).toBe(0)
  })

  test("applies changes only when shown again", async () => {
    const { active, value, counts, patches } = setup()

    active.set(true)
    await tick()
    active.set(false)
    await tick()

    const renders = counts.render
    const inner = counts.inner
    const sent = patches.length

    value.set("b")
    await tick()

    expect(counts.render).toBe(renders)
    expect(counts.inner).toBe(inner)
    expect(patches.length).toBe(sent)

    active.set(true)
    await tick()
    await tick()

    expect(counts.render).toBe(renders + 1)
    expect(counts.inner).toBe(inner + 1)
    expect(JSON.stringify(patches.slice(sent))).toContain("inner b")
  })

  test("preload builds hidden content that still defers updates", async () => {
    const { app } = harness()
    const value = signal("a")
    const counts = { setup: 0, render: 0 }

    const Screen = component(() => {
      counts.setup++

      return () => {
        counts.render++

        return Text({ text: value.get() })
      }
    })

    app.window("main").render(() =>
      Column({ key: "root" }, KeepAlive({ key: "screen", active: false, preload: true }, () => Screen({}))),
    )

    await tick()
    expect(counts.setup).toBe(1)

    const renders = counts.render

    value.set("b")
    await tick()
    expect(counts.render).toBe(renders)
  })

  test("disposes the content when it leaves the tree", async () => {
    const { active, present, counts } = setup()

    active.set(true)
    await tick()
    present.set(false)
    await tick()

    expect(counts.cleanup).toBe(1)
  })
})

describe("memo rows", () => {
  interface Item {
    readonly ID: string
    readonly title: string
  }

  const withoutIDs = (value: unknown): unknown => {
    return JSON.parse(JSON.stringify(value, (key, inner) => (key === "id" ? undefined : inner)))
  }

  type Shown = { path: string; children?: Shown[] }

  const find = (nodes: Shown[], path: string): Shown | null => {
    for (const node of nodes) {
      if (node.path === path) return node
      if (path.startsWith(`${node.path}/`)) return find(node.children ?? [], path)
    }

    return null
  }

  const mount = (memo: boolean) => {
    const { app, trees, patches } = harness()
    const shown: { tree: Shown[] } = { tree: [] }

    // What the host would show: the last full tree with every patch applied.
    app.onSendUi = (_label, tree) => {
      trees.push(tree)
      shown.tree = structuredClone(tree) as Shown[]
    }

    app.onSendUiPatch = (_label, sent) => {
      patches.push(sent)

      for (const patch of sent) {
        const target = find(shown.tree, patch.path)

        if (!target) throw new Error(`no node at ${patch.path}`)

        if (patch.shallow) Object.assign(target, structuredClone(patch.node), { children: target.children })
        else Object.assign(target, structuredClone(patch.node))
      }
    }
    const items = signal<Item[]>([
      { ID: "a", title: "A" },
      { ID: "b", title: "B" },
      { ID: "c", title: "C" },
    ])
    const extra = signal("x")
    const mode = signal("plain")
    const renders: string[] = []
    const taps: string[] = []

    app.window("main").render(() => {
      // Read outside the rows: a captured value is only fresh for rows that rerun.
      return Column(
        { key: "root" },
        For({
          each: items.get(),
          keyOf: (item) => item.ID,
          memo,
          render: (item) => {
            renders.push(item.ID)

            return Row(
              { onLayout: () => taps.push(`${item.ID}:${item.title}`) },
              Text({ text: item.title }),
              Text({ text: extra.get() }),
              mode.get() === "plain" ? null : Text({ text: `mode ${item.ID}` }),
            )
          },
        }),
      )
    })

    return { app, trees, patches, shown, items, extra, mode, renders, taps }
  }

  const tap = (path: string) => dispatchWindowEvent("main", path, "layout", { width: 1, height: 1, x: 0, y: 0 })

  test("produces the same tree as a plain list across changes", async () => {
    const plain = mount(false)
    const memo = mount(true)

    await tick()

    const steps: Array<(m: typeof plain) => void> = [
      (m) => m.items.set(m.items.peek().map((item) => (item.ID === "b" ? { ...item, title: "B2" } : item))),
      (m) => m.items.set([{ ID: "z", title: "Z" }, ...m.items.peek()]),
      (m) => m.items.set([...m.items.peek()].reverse()),
      (m) => m.extra.set("y"),
      (m) => m.mode.set("more"),
      (m) => m.items.set(m.items.peek().slice(1)),
    ]

    for (const step of steps) {
      step(plain)
      step(memo)
      await tick()

      expect(withoutIDs(memo.shown.tree)).toEqual(withoutIDs(plain.shown.tree))
    }
  })

  test("reruns only the row whose signal changed", async () => {
    const { extra, renders } = mount(true)

    await tick()
    renders.length = 0

    extra.set("y")
    await tick()

    // Every row reads `extra`, so every row reruns; none is built twice.
    expect(renders.sort()).toEqual(["a", "b", "c"])
  })

  test("skips unchanged rows when the list changes", async () => {
    const { items, renders, patches } = mount(true)

    await tick()
    renders.length = 0

    items.set(items.peek().map((item) => (item.ID === "b" ? { ...item, title: "B2" } : item)))
    await tick()

    expect(renders).toEqual(["b"])
    expect(JSON.stringify(patches.at(-1))).toContain("B2")
  })

  test("a row reads a signal it does not get as a prop", async () => {
    const { mode, renders, patches } = mount(true)

    await tick()
    renders.length = 0

    mode.set("more")
    await tick()

    expect(renders.sort()).toEqual(["a", "b", "c"])
    expect(JSON.stringify(patches.at(-1))).toContain("mode a")
  })

  test("reordering keeps rows and moves their paths", async () => {
    const { items, shown, renders, taps } = mount(true)

    await tick()
    renders.length = 0

    items.set([...items.peek()].reverse())
    await tick()

    const root = shown.tree[0] as { children: Array<{ children: Array<{ path: string }> }> }

    expect(renders).toEqual([])
    expect(root.children[0]!.children.map((row) => row.path)).toEqual(["/root/0/c", "/root/0/b", "/root/0/a"])

    tap("/root/0/a")
    expect(taps).toEqual(["a:A"])
  })

  test("a reused row keeps working handlers, a changed row gets new ones", async () => {
    const { items, taps } = mount(true)

    await tick()

    items.set(items.peek().map((item) => (item.ID === "b" ? { ...item, title: "B2" } : item)))
    await tick()

    tap("/root/0/a")
    tap("/root/0/b")
    expect(taps).toEqual(["a:A", "b:B2"])
  })

  test("conditional children inside a kept row follow their signal", async () => {
    const { mode, patches, items } = mount(true)

    await tick()
    mode.set("more")
    await tick()
    mode.set("plain")
    await tick()

    expect(JSON.stringify(patches.at(-1))).not.toContain("mode a")

    items.set([...items.peek(), { ID: "d", title: "D" }])
    await tick()
    expect(JSON.stringify(patches.at(-1))).toContain('"/root/0/d"')
  })

  test("removed rows are disposed", async () => {
    const { items, renders } = mount(true)

    await tick()
    items.set(items.peek().filter((item) => item.ID !== "a"))
    await tick()
    items.set([{ ID: "a", title: "A" }, ...items.peek()])
    await tick()

    expect(renders.filter((ID) => ID === "a")).toEqual(["a", "a"])
  })
})
