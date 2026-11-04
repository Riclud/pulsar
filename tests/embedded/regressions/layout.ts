import { App, Box, Column, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()

const seen = new Set<string>()

const report = (name: string) => {
  return ({ width }: { width: number }) => {
    const line = `SIZE ${name} ${Math.round(width)}`

    if (seen.has(line)) return

    seen.add(line)
    console.log(line)
  }
}

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 300 },
      Column(
        { key: "content", fillWidth: true, fillHeight: true },
        Row(
          { key: "shares", fillWidth: true },
          Box({ key: "one", flex: 1, height: 10, onLayout: report("one") }),
          Box({ key: "two", flex: 2, height: 10, onLayout: report("two") }),
          Box({ key: "three", flex: 1, height: 10 }),
        ),
        Row(
          { key: "mixed", fillWidth: true },
          Box({ key: "fixed", width: 40, height: 10, onLayout: report("fixed") }),
          Box({ key: "after", flex: 1, height: 10, onLayout: report("after") }),
        ),
        Column(
          { key: "wide", alignItems: "center", fillWidth: true, onLayout: report("wide"), color: "#222" },
          Text({ text: "centered" }),
        ),
        Row({ key: "padding" }, Box({ key: "padded", paddingX: 24, width: undefined, onLayout: report("padded") })),
      ),
    ),
  )
})
