import { App, Card, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.on("back-pressed", () => console.log("BACK pressed"))

app.window("main").render(() => {
  return Column(
    { key: "root", fillWidth: true },
    Card({ key: "b", height: 60, onClick: () => console.log("CLICK b") }, Text({ text: "card" })),
  )
})
