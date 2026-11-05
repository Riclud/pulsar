import { App, Box, Column, Lightning, Wave } from "../../../core/sdk/index.ts"

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
      Lightning({ key: "bolt", height: 80, fillWidth: true, progress: 0.5 }),
    ),
  )
})

setTimeout(() => app.store.set("speed", 2), 300)
