import { App, Box, Column, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("enabled", false)

const report = ({ width }: { width: number }) => console.log(`SIZE filled ${Math.round(width)}`)

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      {
        key: "panel",
        width: 400,
        height: 100,
        color: "#222",
        enabled: app.store.get("enabled") === true,
        hover: { color: "#333" },
        pressed: { color: "#111", scale: 0.98 },
        disabled: { opacity: 0.5 },
        transition: { duration: 40 },
      },
      Row({ key: "filled", fillWidth: true, onLayout: report }, Text({ text: "narrow child" })),
    ),
  )
})

setTimeout(() => app.store.set("enabled", true), 300)
