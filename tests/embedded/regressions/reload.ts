import { App, Column, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.window("main").render(() => {
  return Column({ key: "root" }, Text({ text: "reloaded" }))
})
