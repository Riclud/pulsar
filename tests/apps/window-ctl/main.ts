import { App } from "../../../core/sdk/index.ts"

const app = new App()

app.on("window-close", (params) => {
  app.store.set("closedLabel", params.label ?? "?")
})
app.on("window-all-closed", () => {
  app.store.set("allClosed", true)
})
app.on("window-resize", (params) => {
  app.store.set("resizedLabel", params.label)
})
app.on("window-state", (params) => {
  app.store.set("stateLabel", params.label)
  app.store.set("stateValue", params.state)
})
app.on("ui-got", (msg: { event: string; target: string }) => {
  app.store.set("uiEvent", msg.event)
  app.store.set("uiTarget", msg.target)
})

const third = app.createWindow({
  label: "third",
  ui: "ui/second.qml",
  width: 200,
  height: 150,
  title: "Third",
})

setTimeout(() => {
  app.send("ping", "pong", "main")
  void third.setSize(300, 220)
}, 400)

setTimeout(async () => {
  await app.window("second").setTitle("Second Renamed")
  await app.window("second").close()
  app.store.set("secondClosed", true)
}, 700)

app.run()
