import { App } from "../../../core/sdk/index.ts"

const app = new App()

app.on("window-close", (params: { label?: string }) => {
  app.store.set("closedLabel", params?.label ?? "?")
})
app.on("window-all-closed", () => {
  app.store.set("allClosed", true)
})

setTimeout(async () => {
  await app.window("second").setTitle("Second Renamed")
  await app.window("second").close()
  app.store.set("secondClosed", true)
}, 600)

app.run()
