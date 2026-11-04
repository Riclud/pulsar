import { App, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("step", 0)

app.window("late").render(() => {
  const added = Number(app.store.get("step")) > 0

  return Column({ key: "root" }, Text({ text: "first" }), added ? Text({ text: "second" }) : null)
})

setTimeout(() => app.store.set("step", 1), 200)
setTimeout(() => app.createWindow({ label: "late", width: 200, height: 200, title: "Late" }), 500)
