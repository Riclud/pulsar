import { App } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("assocReady", true)
app.run()
