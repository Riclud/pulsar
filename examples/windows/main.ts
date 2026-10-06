import { App } from "pulsar"

const app = new App()

app.store.set("counter", 0)
app.store.set("panelOpen", true)
app.store.set("lastClosed", "")

app.on("increment", () => {
  app.store.set("counter", (app.store.get("counter") as number) + 1)
})

app.on("togglePanel", async () => {
  const open = app.store.get("panelOpen") as boolean
  const panel = app.window("panel")
  await (open ? panel.hide() : panel.show())
  app.store.set("panelOpen", !open)
})

app.on("renamePanel", async (params: { title: string }) => {
  await app.window("panel").setTitle(params.title)
  app.store.set("panelTitle", params.title)
})

app.on("window-close", (params: { label?: string }) => {
  app.store.set("lastClosed", params?.label ?? "?")
  if (params?.label === "panel") app.store.set("panelOpen", false)
})

app.run()
