import { App } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("greeting", "shared")
console.error("two-window ready")

app.run()
