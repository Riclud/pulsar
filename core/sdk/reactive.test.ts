import { describe, expect, test } from "bun:test"
import { App } from "./app.ts"
import { computed, createState, effect, signal } from "./reactive.ts"
import { Column, Text, collectUiHandlers, component, onCleanup, onMount, type UiPatch } from "./ui.ts"

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
