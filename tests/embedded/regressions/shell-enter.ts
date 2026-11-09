import { App, Box, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("shown", false)

const report = ({ height }: { height: number }) => console.log(`SIZE entering ${Math.round(height)}`)

app.window("main").render(() => {
  const shown = app.store.get("shown") === true

  return Column(
    { key: "root", fill: true },
    Text({ key: "header", text: "header" }),
    shown
      ? Box(
          {
            key: "entering",
            enter: { opacity: 0 },
            transition: { duration: 400, curve: "linear" },
            onLayout: report,
          },
          Box({ key: "tall", width: 100, height: 80 }),
        )
      : null,
  )
})

setTimeout(() => app.store.set("shown", true), 400)
