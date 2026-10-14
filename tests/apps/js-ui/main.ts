import { App, ui } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("count", 0)

app.window("main").render(() =>
  ui.column({ gap: 8, padding: 16 }, [
    ui.text(`Count: ${(app.store.get("count") as number) ?? 0}`),
    ui.button("+1", {
      onClick: () => app.store.set("count", ((app.store.get("count") as number) ?? 0) + 1),
    }),
    ui.checkbox("Enabled", { checked: false }),
    ui.textInput({ placeholder: "Name" }),
  ]),
)

app.run()
