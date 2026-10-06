import { App, tray } from "../../../core/sdk/index.ts"

const app = new App()

await tray.setTooltip("Pulsar")
await tray.setMenu([{ label: "One", event: "one" }, { separator: true }, { label: "Two", event: "two" }])

app.store.set("traySet", true)
app.run()
