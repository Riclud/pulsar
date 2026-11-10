import { App, Box, Column, Tabs, Text } from "../../../core/sdk/index.ts"

const app = new App()

const seen = new Set<string>()

const report = (name: string) => {
  return ({ y, height }: { y: number; height: number }) => {
    const line = `TABS ${name} ${Math.round(y)} ${Math.round(height)}`

    if (seen.has(line)) return

    seen.add(line)
    console.log(line)
  }
}

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 300, height: 400 },
      Column(
        { key: "content", fill: true },
        Text({ key: "title", text: "Title" }),
        Tabs(
          { key: "tabs", items: ["One", "Two"], index: 0, onLayout: report("tabs") },
          Box({ key: "page", height: 60, color: "#345" }),
          Box({ key: "other", height: 60, color: "#543" }),
        ),
        Text({ key: "footer", text: "Footer", onLayout: report("footer") }),
      ),
    ),
  )
})
