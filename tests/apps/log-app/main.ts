import { App } from "../../../core/sdk/index.ts"

const app = new App()

// Direction 1: QML console -> app event.
app.on("log", (params: { source?: string; message?: string }) => {
  if (params?.source === "qml" && String(params.message).includes("from-qml")) app.store.set("qmlLog", true)
})

// Direction 2: app log -> QML -> back to the app.
app.on("jsLogSeen", () => {
  app.store.set("jsLog", true)
})

setTimeout(() => console.error("from-js-log"), 800)

app.run()
