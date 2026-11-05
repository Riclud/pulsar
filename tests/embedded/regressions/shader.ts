import { App, Aurora, Box, Column, Lightning, Stack, Wave } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("speed", 1)

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 400 },
      Wave({
        key: "wave",
        width: 300,
        height: 40,
        speed: Number(app.store.get("speed")),
        onLayout: ({ width }) => console.log(`SIZE wave ${Math.round(width)}`),
      }),
      Lightning({ key: "bolt", height: 80, fillWidth: true, progress: 0.5, from: [0, 0], to: [1, 1] }),
      Stack(
        { key: "glassy", width: 200, height: 100 },
        Aurora({ key: "bg", fill: true }),
        Column(
          { key: "pane", width: 80, height: 40, radius: 12, glass: { blur: 24, tint: "#22ffffff" }, onLayout: ({ width }) => console.log(`SIZE pane ${Math.round(width)}`) },
          Box({ key: "spun", width: 20, height: 20, rotation: 45, spinSpeed: 10, blur: 4 }),
        ),
      ),
    ),
  )
})

setTimeout(() => app.store.set("speed", 2), 300)
