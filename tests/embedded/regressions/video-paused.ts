import { App, Column, Video } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("paused", true)

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Video({
      key: "clip",
      source: "clip.webm",
      autoplay: true,
      paused: Boolean(app.store.get("paused")),
      loop: true,
      muted: true,
      width: 96,
      height: 54,
    }),
  )
})

setTimeout(() => console.log("PHASE paused"), 1000)
setTimeout(() => app.store.set("paused", false), 1100)
setTimeout(() => console.log("PHASE playing"), 2200)
