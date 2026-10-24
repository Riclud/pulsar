import { App } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("overlay", true)
app.store.set("event", "ready")

app.on("ping", () => app.store.set("pong", true))

app.on("app-pause", (payload) => {
  app.store.set("event", `pause:${payload.state}`)
  console.log(`lifecycle: pause ${payload.state}`)
})

app.on("app-resume", () => {
  app.store.set("event", "resume")
  console.log("lifecycle: resume")
})

app.on("app-stop", () => {
  app.store.set("event", "stop")
  console.log("lifecycle: stop")
})

app.on("back-pressed", () => {
  console.log("lifecycle: back")

  if (app.store.get("overlay")) {
    app.store.set("overlay", false)
    app.store.set("event", "back: overlay closed")

    return
  }

  app.store.set("event", "back: quit")
  app.quit()
})
