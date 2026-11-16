import { App, Card, Column, Icon, Image, Row, Text } from "../../../core/sdk/index.ts"

declare const __pulsarEnv: (name: string) => string

const app = new App()
const icon = `file://${__pulsarEnv("PULSAR_APP")}/wide.png`

// A list row as apps write it: a card with hover, press and motion, an image tile and an icon button.
app.window("main").render(() => {
  return Column(
    { key: "root", fillWidth: true },
    Card(
      {
        key: "row",
        padding: 2,
        radius: 10,
        elevation: 0,
        color: "#202020",
        hoverColor: "#303030",
        borderColor: "#404040",
        borderWidth: 1,
        pressed: { color: "#353535" },
        enter: { opacity: 0 },
        exit: { opacity: 0 },
        transition: { duration: 40 },
        onClick: () => console.log("CLICK row"),
      },
      Row(
        { key: "line", gap: 10, fillWidth: true, alignItems: "center" },
        Column(
          {
            key: "avatar",
            width: 36,
            height: 36,
            radius: 8,
            justify: "center",
            alignItems: "center",
            color: "#ffffff",
          },
          Image({ key: "icon", src: icon, width: 22, height: 22, fillMode: "contain" }),
        ),
        Text({ key: "title", text: "title", flex: 1, fillWidth: true, maxLines: 1, elide: "right" }),
        Column(
          {
            key: "tile",
            width: 36,
            height: 36,
            radius: 8,
            a11yLabel: "Open",
            a11yRole: "button",
            justify: "center",
            alignItems: "center",
            hover: { color: "#505050" },
            pressed: { color: "#606060", scale: 0.9 },
            transition: { duration: 40 },
            onClick: () => console.log("CLICK tile"),
          },
          Icon({ name: "key", size: 20 }),
        ),
      ),
    ),
  )
})
