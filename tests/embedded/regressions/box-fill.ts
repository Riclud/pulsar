import { App, Box, Card, Column } from "../../../core/sdk/index.ts"

const app = new App()

const seen = new Set<string>()

const report = (name: string) => {
  return ({ width, height }: { width: number; height: number }) => {
    const line = `FILL ${name} ${Math.round(width)} ${Math.round(height)}`

    if (seen.has(line)) return

    seen.add(line)
    console.log(line)
  }
}

app.window("main").render(() => {
  return Box(
    { key: "frame", width: 400, height: 300 },
    Column(
      { key: "root", fillWidth: true },
      Box(
        { key: "sized", width: 200, color: "#234" },
        Box({ key: "in-box", fillWidth: true, height: 10, onLayout: report("box") }),
      ),
      Card({ key: "card", width: 240 }, Box({ key: "in-card", fillWidth: true, height: 10, onLayout: report("card") })),
      Column(
        { key: "wide", width: 180 },
        Box({ key: "in-column", fillWidth: true, height: 10, onLayout: report("column") }),
      ),
      Box({ key: "hug", color: "#432" }, Box({ key: "in-hug", fillWidth: true, height: 10, onLayout: report("hug") })),
    ),
  )
})
