import { App } from "../../../core/sdk/index.ts"

const app = new App()
const file = "/tmp/pulsar-recent.txt"

if (process.env.PULSAR_RECENT_MODE === "clear") {
  app.clearRecentDocuments()
  app.store.set("recentCleared", true)
} else {
  app.addRecentDocument(file)
  app.store.set("recentAdded", true)
}

app.run()
