import { App } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("greeting", "Hello Android")
app.on("ping", () => app.store.set("pong", true))
