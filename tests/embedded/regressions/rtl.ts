import { App, Box, Column, Row, theme } from "../../../core/sdk/index.ts"

const app = new App()

const report = (name: string) => {
  return ({ x }: { x: number }) => {
    console.log(`POS ${name} ${Math.round(x)}`)
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
          { key: "row", fillWidth: true, paddingLeft: 10, gap: 5 },
          Box({ key: "a", width: 40, height: 10, onLayout: report("a") }),
          Box({ key: "b", width: 30, height: 10, onLayout: report("b") }),
        ),
        Column(
          { key: "col", fillWidth: true, paddingLeft: 10 },
          Box({ key: "start", width: 40, height: 10, onLayout: report("start") }),
          Box({ key: "end", width: 40, height: 10, align: "end", onLayout: report("end") }),
        ),
      ),
    ),
  )
})

const flip = (direction: "ltr" | "rtl") => {
  console.log(`PHASE ${direction}`)
  void theme.set({ direction })
}

console.log("PHASE ltr")

setTimeout(() => flip("rtl"), 1500)
setTimeout(() => flip("ltr"), 2500)
