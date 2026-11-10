import { App, Column, Qml, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("phase", 0)

app.window("main").render(() => {
  const phase = Number(app.store.get("phase"))

  return Column(
    { key: "root" },
    phase === 0 || phase === 1
      ? Qml({ key: phase === 0 ? "first" : "second", source: "probe.qml", props: { name: `p${phase}` } })
      : null,
    phase >= 2 ? Text({ key: "gone", text: "removed" }) : null,
  )
})

setTimeout(() => app.store.set("phase", 1), 400)
setTimeout(() => app.store.set("phase", 2), 800)
