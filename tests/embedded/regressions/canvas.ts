import { App, Box, Canvas, Column } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("tone", "#123456")

const outer = 1

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 400 },
      Canvas({
        key: "still",
        width: 300,
        height: 40,
        params: { tone: String(app.store.get("tone")) },
        onLayout: ({ width }) => console.log(`SIZE sized ${Math.round(width)}`),
        draw: (_ctx, { width, height, params }) => {
          console.log(`CANVAS still ${Math.round(width)} ${Math.round(height)} ${params.tone}`)
        },
      }),
      Canvas({
        key: "moving",
        width: 100,
        height: 20,
        animated: true,
        draw: (ctx, { time, width }) => {
          console.log("CANVAS moving")
          ctx.beginPath()
          ctx.arc(width * Math.sin(time), 10, 4, 0, 6.3)
          ctx.fill()
        },
      }),
      Canvas({
        key: "broken",
        width: 10,
        height: 10,
        draw: () => {
          console.log(outer)
        },
      }),
    ),
  )
})

setTimeout(() => app.store.set("tone", "#654321"), 900)
