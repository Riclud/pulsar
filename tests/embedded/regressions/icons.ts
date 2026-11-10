import { App, Column, Icon, Row, theme } from "../../../core/sdk/index.ts"

const app = new App()

app.window("main").render(() => {
  return Column(
    { key: "root", fillWidth: true },
    Row(
      { key: "row" },
      Icon({ key: "plain", name: "home" }),
      Icon({ key: "sized", name: "star", size: 32 }),
      Icon({ key: "themed", name: "favorite", color: "brand" }),
      Icon({ key: "literal", name: "close", color: "#ff0000", align: "center", width: 80 }),
      Icon({ key: "badged", name: "mail", badge: 3 }),
    ),
  )
})

void theme.set({
  colors: { brand: "#336699" },
  palette: { text: "#112233" },
  fontScale: 1.5,
  iconFamily: "Test Icons",
})
