import { App, Box, Column, For, Page, Text } from "../../../core/sdk/index.ts"

const app = new App()
const items = ["one", "two", "three"]

const report = (name: string) => ({ height }: { width: number; height: number }) => {
  console.log(`LIST ${name} ${Math.round(height)}`)
}

const row = (item: string) => Box({ key: item, height: 40 }, Text({ text: item }))

app.window("main").render(() => {
  return Column(
    { key: "root", fillWidth: true },
    Box(
      { key: "paged", width: 300, height: 300 },
      Page(
        { key: "page", padding: 0 },
        For({ key: "inPage", each: items, keyOf: (item) => item, render: row, onLayout: report("page") }),
      ),
    ),
    Column(
      { key: "column", width: 300, height: 300 },
      For({ key: "inColumn", each: items, keyOf: (item) => item, render: row, onLayout: report("column") }),
    ),
  )
})
