import { App, tray } from "pulsar"

const app = new App()

app.store.set("count", 0)

function bump() {
  app.store.set("count", (app.store.get("count") as number) + 1)
}

app.on("bump", bump)
app.on("quit", () => app.quit())

// Tray menu items deliver their `event` back to the app as "tray-menu".
app.on("tray-menu", (data: { event?: string }) => {
  if (data?.event === "bump") bump()
  else if (data?.event === "quit") app.quit()
})

void tray.setIcon((process.env.PULSAR_APP ?? ".") + "/assets/icon.png")
void tray.setTooltip("{{title}}")
void tray.setMenu([{ label: "Bump", event: "bump" }, { separator: true }, { label: "Quit", event: "quit" }])

app.run()
