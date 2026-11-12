import { App, Box, Column, Input, Scroll, type ScrollState } from "../../../core/sdk/index.ts"

const app = new App()

const report = (name: string) => {
  return (state: ScrollState) =>
    console.log(`SF ${name} ${Math.round(state.contentHeight)} ${Math.round(state.offset)}`)
}

// A scroll whose first child holds a text field keeps the room QML leaves above it. The QML scroll is
// forced by a tooltip, and both copies must report the same content height.
const form = (prefix: string, props: Record<string, unknown>) => {
  return Scroll(
    { key: `${prefix}-scroll`, height: 110, padding: 6, onScroll: report(prefix), ...props },
    Column(
      { key: `${prefix}-form` },
      Input({ key: `${prefix}-first`, focus: prefix === "native", onFocus: () => console.log(`SF ${prefix} focus`) }),
      Box({ key: `${prefix}-tail`, height: 200, fillWidth: true }),
    ),
  )
}

app.window("main").render(() => {
  return Column({ key: "root", fill: true }, form("native", {}), form("qml", { tooltip: "island" }))
})
