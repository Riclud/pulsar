import { App, Box, Button, Column, signal, Text } from "pulsar"

const app = new App()
const count = signal(0)

app
  .window("main")
  .render(() =>
    Box(
      { key: "root", fill: true, color: "#101114", padding: 24 },
      Column(
        { key: "content", gap: 16 },
        Text({ key: "title", text: "Pulsar on iOS", size: 28, color: "#ffffff" }),
        Text({ key: "count", text: `Tapped ${count.get()} times`, color: "#a0a4ad" }),
        Button({ key: "tap", label: "Tap", onClick: () => count.set(count.get() + 1) }),
      ),
    ),
  )

app.run()
