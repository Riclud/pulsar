import { App, Box, Column, Row, Scroll, Text } from "../../../core/sdk/index.ts"

const app = new App()

const report = (name: string) => {
  return ({ width, height }: { width: number; height: number }) => {
    console.log(`SW ${name} ${Math.round(width)} ${Math.round(height)}`)
  }
}

// A column in a scroll takes the scroll's width, whether the scroll is drawn natively or by QML.
// The probe fills its column, so its width is the column's. The QML scroll is forced by a tooltip.
const probe = (name: string) => {
  return Box({ key: name, height: 10, fillWidth: true, onLayout: report(name) })
}

const scroll = (prefix: string, props: Record<string, unknown>) => {
  return Scroll(
    { key: `${prefix}-scroll`, height: 100, ...props },
    Column({ key: `${prefix}-col` }, Text({ text: "short" }), probe(`${prefix}-text`)),
    Column({ key: `${prefix}-plain` }, probe(`${prefix}-plain-probe`)),
    Row({ key: `${prefix}-row` }, Text({ text: "short" }), probe(`${prefix}-row-probe`)),
    Column({ key: `${prefix}-sized`, width: 100 }, probe(`${prefix}-sized-probe`)),
  )
}

app.window("main").render(() => {
  return Column({ key: "root", fill: true }, scroll("native", {}), scroll("qml", { tooltip: "island" }))
})
