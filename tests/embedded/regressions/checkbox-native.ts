import { App, Checkbox, Column, Switch } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("synced", false)

// Rows are 26 and 30 px tall with a 10 px gap: the checkbox is at y 0..26, the switch at y 36..66.
app.window("main").render(() => {
  return Column(
    { key: "root", gap: 10 },
    Checkbox({
      key: "box",
      label: "Accept",
      checked: false,
      onToggle: (value) => console.log(`TOGGLE box ${value}`),
    }),
    Switch({
      key: "sw",
      label: "Wifi",
      checked: app.store.get("synced") === true,
      onToggle: (value) => console.log(`TOGGLE sw ${value}`),
    }),
    Checkbox({ key: "off", label: "Off", checked: true, enabled: false, onToggle: () => console.log("TOGGLE off") }),
  )
})

setTimeout(() => app.store.set("synced", true), 1500)
