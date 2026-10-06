import { App, dialog } from "../../../core/sdk/index.ts"

const app = new App()

const picked = await dialog.openFile({ title: "Pick", filter: "All files (*)" })
app.store.set("picked", picked)

await dialog.message({ title: "Hi", text: "there" })
app.store.set("messaged", true)

app.run()
