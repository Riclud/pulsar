import { App, Column, For, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()
const rows = Array.from({ length: 400 }, (_, index) => `row ${index}`)

app.window("main").render(() => {
  return Column(
    { key: "root", fill: true },
    For({
      key: "list",
      each: rows,
      keyOf: (row) => row,
      render: (row) => Row({ height: 36, padding: 6 }, Text({ text: row }), Text({ text: "detail" })),
    }),
  )
})
