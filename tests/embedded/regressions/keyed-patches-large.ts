import { App, Column, For, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()
const keys = Array.from({ length: 300 }, (_, index) => `k${index}`)

app.store.set("keys", keys)

app.window("main").render(() => {
  return Column(
    { key: "root", fill: true },
    For({
      key: "list",
      each: app.store.get("keys") as string[],
      keyOf: (key) => key,
      memo: true,
      render: (key) => Row({ height: 20 }, Text({ text: key }), Text({ text: "row" })),
    }),
  )
})

setTimeout(() => app.store.set("keys", ["first", ...keys]), 300)
setTimeout(() => app.store.set("keys", keys), 600)
setTimeout(() => app.store.set("keys", keys.slice(1)), 900)
setTimeout(() => app.store.set("keys", [keys[2]!, keys[1]!, ...keys.slice(3)]), 1200)
