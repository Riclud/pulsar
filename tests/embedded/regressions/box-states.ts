import { App, Box, Card, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("enabled", false)

app.window("main").render(() => {
  return Column(
    { key: "root", fillWidth: true },
    Box(
      {
        key: "a",
        width: 200,
        height: 40,
        color: "#222222",
        hover: { color: "#333333" },
        transition: { duration: 40 },
      },
      Text({ text: "hover" }),
    ),
    Card(
      {
        key: "b",
        height: 60,
        color: "#444444",
        hoverColor: "#555555",
        pressed: { color: "#666666", borderColor: "#777777" },
        onClick: () => console.log("CLICK b"),
      },
      Text({ text: "card" }),
    ),
    Box(
      {
        key: "c",
        width: 200,
        height: 40,
        color: "#999999",
        enabled: app.store.get("enabled") === true,
        disabled: { color: "#888888", borderColor: "#aaaaaa" },
      },
      Text({ text: "disabled" }),
    ),
  )
})

setTimeout(() => app.store.set("enabled", true), 1500)
