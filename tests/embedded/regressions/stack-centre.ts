import { App, Box, Column, Row, Stack } from "../../../core/sdk/index.ts"

const app = new App()

const seen = new Set<string>()

const report = (name: string) => {
  return ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => {
    const line = `BOX ${name} ${Math.round(x)} ${Math.round(y)} ${Math.round(width)} ${Math.round(height)}`

    if (seen.has(line)) return

    seen.add(line)
    console.log(line)
  }
}

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Row(
      { key: "pair" },
      Stack(
        { key: "hug" },
        Box({ key: "big", width: 100, height: 50 }),
        Box({ key: "small", width: 20, height: 20, onLayout: report("small") }),
      ),
      Box({ key: "after", width: 10, height: 10, onLayout: report("after") }),
    ),
    Box(
      { key: "frame", width: 300, height: 200 },
      Stack({ key: "filled", fill: true }, Box({ key: "dot", width: 20, height: 20, onLayout: report("dot") })),
    ),
  )
})
