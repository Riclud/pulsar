import { App, Button, Column } from "../../../core/sdk/index.ts"

const app = new App()

// Heights are 40, 32, 48 and 40 px with a 10 px gap: y 0..40, 50..82, 92..140, 150..190.
app.window("main").render(() => {
  return Column(
    { key: "root", gap: 10 },
    Button({ key: "md", label: "Open", onClick: () => console.log("CLICK md") }),
    Button({
      key: "sm",
      label: "Small",
      size: "sm",
      variant: "soft",
      color: "#336699",
      onClick: () => console.log("CLICK sm"),
    }),
    Button({
      key: "lg",
      label: "Large",
      size: "lg",
      variant: "outline",
      radius: 4,
      icon: "add",
      iconPosition: "right",
      textColor: "#112233",
      onClick: () => console.log("CLICK lg"),
    }),
    Button({ key: "off", label: "Off", enabled: false, onClick: () => console.log("CLICK off") }),
  )
})
