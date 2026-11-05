import { App, Box, Column, Row } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("step", 0)

const report = (name: string) => {
  return ({ width, height }: { width: number; height: number }) => {
    console.log(`SIZE ${name} ${Math.round(width)} ${Math.round(height)}`)
  }
}

app.window("main").render(() => {
  const color = Number(app.store.get("step")) === 0 ? "#111" : "#222"

  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 400 },
      Row(
        { key: "across", fillWidth: true, height: 20 },
        Box({ key: "a", flex: 1, height: 20, color, onLayout: report("across") }),
        Box({ key: "b", flex: 1, height: 20 }),
      ),
      Column(
        { key: "down", width: 20, height: 200 },
        Box({ key: "c", flex: 1, width: 20, color, onLayout: report("down") }),
        Box({ key: "d", flex: 3, width: 20 }),
      ),
    ),
  )
})

setTimeout(() => app.store.set("step", 1), 300)
