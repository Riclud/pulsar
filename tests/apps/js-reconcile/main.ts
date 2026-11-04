import { App, Column, For, Text } from "../../../core/sdk/index.ts"

interface Item {
  id: string
  text: string
}

const app = new App()

const initial: Item[] = [
  { id: "a", text: "A" },
  { id: "b", text: "B" },
  { id: "c", text: "C" },
]

const items = (): Item[] => app.store.get("items") as Item[]

app.store.set("items", initial)

setTimeout(() => {
  app.store.set("items", [{ id: "z", text: "Z" }, ...items()])
}, 400)

setTimeout(() => {
  app.store.set("items", [...items()].reverse())
}, 800)

setTimeout(() => {
  app.store.set("reordered", true)
}, 1000)

app.window("main").render(() =>
  Column(
    { fill: true },
    For({
      each: items(),
      keyOf: (item) => item.id,
      render: (item) => Text({ text: item.text }),
    }),
  ),
)

app.run()
