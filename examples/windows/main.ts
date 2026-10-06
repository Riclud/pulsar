import { App, tray } from "pulsar"

const app = new App()

app.store.set("counter", 0)
app.store.set("panelOpen", true)
app.store.set("lastClosed", "")

function increment() {
  app.store.set("counter", (app.store.get("counter") as number) + 1)
}

async function togglePanel() {
  const open = app.store.get("panelOpen") as boolean
  const panel = app.window("panel")
  await (open ? panel.hide() : panel.show())
  app.store.set("panelOpen", !open)
}

app.on("increment", increment)
app.on("togglePanel", togglePanel)
app.on("quit", () => app.quit())

app.on("renamePanel", async (params: { title: string }) => {
  await app.window("panel").setTitle(params.title)
  app.store.set("panelTitle", params.title)
})

app.on("window-close", (params: { label?: string }) => {
  app.store.set("lastClosed", params?.label ?? "?")
  if (params?.label === "panel") app.store.set("panelOpen", false)
})

// System tray (the menu events come back as the "tray-menu" event).
app.on("tray-menu", (data: { event?: string }) => {
  if (data?.event === "increment") increment()
  else if (data?.event === "togglePanel") void togglePanel()
  else if (data?.event === "quit") app.quit()
})

const icon = (process.env.PULSAR_APP ?? ".") + "/icon.png"
void tray.setIcon(icon)
void tray.setTooltip("Pulsar windows")
void tray.setMenu([
  { label: "Increment", event: "increment" },
  { label: "Toggle panel", event: "togglePanel" },
  { separator: true },
  { label: "Quit", event: "quit" },
])

app.run()
