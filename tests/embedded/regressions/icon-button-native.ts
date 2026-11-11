import { App, Column, IconButton } from "../../../core/sdk/index.ts"

const app = new App()

// Every icon button is 40 x 40: y 0..40 and 50..90 with a 10 px gap.
app.window("main").render(() => {
  return Column(
    { key: "root", gap: 10 },
    IconButton({ key: "add", name: "add", size: 32, color: "#aa3300", onClick: () => console.log("CLICK add") }),
    IconButton({ key: "off", name: "close", enabled: false, onClick: () => console.log("CLICK off") }),
  )
})
