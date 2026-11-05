import { App, Box, Column, Row } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("step", 0)

const report = ({ width }: { width: number }) => {
  console.log(`SIZE padded ${Math.round(width)}`)
}

app.window("main").render(() => {
  const step = Number(app.store.get("step"))

  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 400 },
      Box(
        { key: "hidden", visible: step !== 1 },
        Row(
          { key: "row", padding: 16, onLayout: report },
          Box({ key: "first", width: 40, height: 10 }),
          step >= 1 ? Box({ key: "second", width: 40, height: 10 }) : null,
        ),
      ),
    ),
  )
})

setTimeout(() => app.store.set("step", 1), 200)
setTimeout(() => app.store.set("step", 2), 400)
