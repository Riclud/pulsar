import { App, Card, Column, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()

const report =
  (name: string) =>
  ({ width, height }: { width: number; height: number }) => {
    console.log(`SIZE ${name} ${Math.round(width)} ${Math.round(height)}`)
  }

app.window("main").render(() => {
  return Column(
    { key: "root", fillWidth: true },
    Card(
      { key: "plain" },
      Row({ key: "plainRow", fillWidth: true, onLayout: report("plain") }, Text({ text: "card" })),
    ),
    Card(
      { key: "tight", padding: 4, radius: 3, color: "#123456" },
      Row({ key: "tightRow", fillWidth: true, onLayout: report("tight") }, Text({ text: "tight" })),
    ),
  )
})
