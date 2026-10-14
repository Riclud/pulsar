import { App, fs } from "../../../core/sdk/index.ts"

const app = new App()

void (async () => {
  try {
    await fs.readFile("/etc/hosts")
    app.store.set("denied", "allowed")
  } catch (e) {
    app.store.set("denied", e instanceof Error ? e.message : String(e))
  }
})()

app.run()
