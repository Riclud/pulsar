import { App } from "../../../core/sdk/index.ts"

const app = new App()

app.on("open-file", (params) => {
  app.store.set("openFile", params.path)
})
app.on("open-url", (params) => {
  app.store.set("openUrl", params.url)
})
app.on("second-instance", (params) => {
  app.store.set("secondArgv", params.argv.join(" "))
})

app.run()
