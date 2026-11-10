import { App, Box, Column, Video } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("phase", 0)

app.window("main").render(() => {
  const phase = Number(app.store.get("phase"))

  return Column(
    { key: "root" },
    // Plays once and reports the end.
    phase < 2
      ? Video({
          key: "once",
          source: "clip.webm",
          autoplay: true,
          muted: true,
          width: 96,
          height: 54,
          onEnded: () => console.log("VIDEO ended"),
        })
      : null,
    // Loops until the node is removed.
    phase < 3
      ? Video({
          key: "loop",
          source: "clip.webm",
          autoplay: true,
          muted: true,
          loop: true,
          fillMode: "cover",
          width: 96,
          height: 54,
        })
      : null,
    Box({ key: "marker", width: 10, height: 10 }),
  )
})

setTimeout(() => app.store.set("phase", 2), 1800)
setTimeout(() => app.store.set("phase", 3), 2400)
setTimeout(() => console.log("PHASE end"), 3200)
