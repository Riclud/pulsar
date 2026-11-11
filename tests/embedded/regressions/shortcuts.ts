import { App, Column, Input, shortcuts } from "../../../core/sdk/index.ts"

const app = new App()

app.window("main").render(() => {
  return Column({ key: "root", gap: 8 }, Input({ key: "field", autoFocus: true, placeholder: "type here", width: 200 }))
})

const offK = shortcuts.register("Ctrl+K", () => console.log("SHORTCUT k"))

shortcuts.register("Mod+Shift+P", () => console.log("SHORTCUT palette"))
shortcuts.register("F5", () => console.log("SHORTCUT refresh"))
shortcuts.register("Escape", () => console.log("SHORTCUT escape"))
shortcuts.register("J", () => console.log("SHORTCUT j"))
shortcuts.register("Alt+Left", () => console.log("SHORTCUT back"), { window: "other" })

setTimeout(() => {
  offK()
  console.log("PHASE removed")
}, 1500)
