import { App, storage } from "../../../core/sdk/index.ts"

const app = new App({ ui: "ui/main.qml", id: "smokestorage", title: "Storage", minWidth: 320, resizable: false })

const key = "smoke-kv"
await storage.set(key, { n: 42 })
const value = (await storage.get(key)) as { n: number } | undefined
app.store.set("storageOk", Boolean(value && value.n === 42))
app.store.set("ready", true)

app.run()
