import { App, Card, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

const Row = (key: string, visible = true) => {
  return Card(
    {
      key,
      visible,
      pressed: { scale: 0.98 },
      enter: { opacity: 0, y: 12 },
      exit: { opacity: 0, x: -80 },
      transition: { duration: 40, curve: "spring" },
      drag: { axis: "x", onRelease: () => {} },
    },
    Text({ text: key }),
  )
}

app.store.set("step", 0)

app.window("main").render(() => {
  const step = Number(app.store.get("step"))

  return Column(
    { key: "root" },
    Row("stays"),
    step < 1 ? Row("removed") : null,
    step >= 1 ? Row("added") : null,
    Row("hidden", step !== 2),
    Row("flip", step !== 4),
  )
})

setTimeout(() => app.store.set("step", 1), 1500)
setTimeout(() => app.store.set("step", 2), 1800)
setTimeout(() => app.store.set("step", 3), 2100)
setTimeout(() => {
  app.store.set("step", 4)

  setTimeout(() => app.store.set("step", 5), 5)
}, 2300)
