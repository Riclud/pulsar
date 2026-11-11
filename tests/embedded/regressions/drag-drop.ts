import { App, Box, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.window("main").render(() => {
  return Column(
    { key: "root", gap: 8 },
    Box(
      {
        key: "zone",
        width: 200,
        height: 60,
        color: "#234",
        onDropFiles: (files, at) => console.log(`DROP ${files.join(",")} ${Math.round(at.x)} ${Math.round(at.y)}`),
      },
      Text({ text: "drop files" }),
    ),
    Box({ key: "other", width: 100, height: 40, color: "#432" }),
  )
})
