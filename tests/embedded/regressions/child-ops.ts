import { App, Box, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()
const steps = [
  ["a", "b"],
  ["x", "a", "b"],
  ["a", "b"],
  ["a", "b", "tail"],
]

app.store.set("step", 0)

// Rows without keys: their paths are their indexes, so one put in front shifts the others.
app.window("main").render(() => {
  const step = Number(app.store.get("step"))

  return Column(
    { key: "root", fillWidth: true, gap: 0 },
    Text({ key: "title", text: "rows", height: 20 }),
    Column(
      { key: "list", gap: 0, fillWidth: true },
      ...steps[step]!.map((name) =>
        Box(
          { height: 30, fillWidth: true, color: "#222222", onClick: () => console.log(`CLICK ${name}@${step}`) },
          Text({ text: name }),
        ),
      ),
    ),
    Box({ key: "foot", height: 20, fillWidth: true, color: "#444444" }, Text({ text: "foot" })),
  )
})

setTimeout(() => app.store.set("step", 1), 500)
setTimeout(() => app.store.set("step", 2), 2000)
setTimeout(() => app.store.set("step", 3), 3600)
