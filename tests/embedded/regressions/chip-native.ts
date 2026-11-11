import { App, Chip, Column } from "../../../core/sdk/index.ts"

const app = new App()

// Chips are 32 px tall: y 0..32, 42..74 and 84..116 with a 10 px gap.
app.window("main").render(() => {
  return Column(
    { key: "root", gap: 10 },
    Chip({ key: "plain", label: "Plain", onClick: () => console.log("CLICK plain") }),
    Chip({
      key: "picked",
      label: "Picked",
      variant: "outline",
      selected: true,
      color: "#336699",
      onClick: () => console.log("CLICK picked"),
      onRemove: () => console.log("REMOVE picked"),
    }),
    Chip({ key: "quiet", label: "Quiet", textColor: "#aa3300" }),
  )
})
