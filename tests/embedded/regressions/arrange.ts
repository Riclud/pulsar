import { App, Arrange, Box, Column } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("target", 0)

const outer = 1

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 400 },
      Arrange(
        {
          key: "moving",
          width: 200,
          height: 100,
          params: { value: Number(app.store.get("target")) },
          transition: { duration: 300 },
          arrange: (index, _count, { params }) => {
            console.log(`ARRANGE glide ${Math.round(params.value)}`)

            return { x: 20 + index * 50, y: 20, scale: 0.5 }
          },
        },
        Box({
          key: "placed",
          width: 40,
          height: 40,
          onLayout: ({ width }) => console.log(`SIZE placed ${Math.round(width)}`),
        }),
      ),
      Arrange(
        {
          key: "still",
          width: 100,
          height: 40,
          arrange: () => {
            console.log("ARRANGE still")

            return { x: 10, y: 10 }
          },
        },
        Box({ key: "one", width: 10, height: 10 }),
      ),
      Arrange(
        {
          key: "broken",
          width: 100,
          height: 40,
          arrange: () => ({ x: outer }),
        },
        Box({ key: "two", width: 10, height: 10 }),
      ),
    ),
  )
})

setTimeout(() => app.store.set("target", 100), 600)
