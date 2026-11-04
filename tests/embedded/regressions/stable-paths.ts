import { App, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("step", 0)

app.window("main").render(() => {
  const step = Number(app.store.get("step"))

  return Column(
    { key: "root", opacity: step >= 1 ? 0.9 : 1 },
    step >= 3 ? Text({ text: "header" }) : null,
    Column({ key: "body" }, Text({ text: step >= 2 ? "changed" : "text" })),
  )
})

setTimeout(() => app.store.set("step", 1), 200)
setTimeout(() => app.store.set("step", 2), 400)
setTimeout(() => app.store.set("step", 3), 600)
