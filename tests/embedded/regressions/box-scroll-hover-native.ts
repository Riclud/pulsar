import { App, Box, Column, For, Text } from "../../../core/sdk/index.ts"

const app = new App()
const rows = Array.from({ length: 40 }, (_, index) => `r${index}`)

app.window("main").render(() => {
  return Column(
    { key: "root", fill: true },
    For({
      key: "list",
      each: rows,
      keyOf: (row) => row,
      render: (row) =>
        Box(
          { height: 40, fillWidth: true, color: "#222222", hover: { color: "#333333" }, transition: { duration: 40 } },
          Text({ text: row }),
        ),
    }),
  )
})
