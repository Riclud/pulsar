import { App, Column, Qml } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("step", 0)

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Qml({ key: "probe", source: "probe.qml", props: { step: Number(app.store.get("step")) } }),
  )
})

for (const step of [1, 2]) setTimeout(() => app.store.set("step", step), step * 250)
