import { App, Box, Column, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()

const square = (key: string) => Box({ key, width: 40, height: 40 })

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 400 },
      Column(
        { key: "tall", fillWidth: true, height: 200, gap: 10 },
        Row({ key: "wide", fillWidth: true, gap: 10 }, square("a"), square("b")),
        Row({ key: "hug", gap: 10 }, square("c"), square("d")),
      ),
      Column(
        { key: "filled", fillWidth: true, height: 100 },
        Box({ key: "grow", fillHeight: true }, Text({ text: "grow" })),
      ),
    ),
  )
})

