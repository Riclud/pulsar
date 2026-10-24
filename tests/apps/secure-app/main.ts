import { App, secureStorage } from "../../../core/sdk/index.ts"

const app = new App()

void (async () => {
  const available = await secureStorage.available()

  app.store.set("secureAvailable", available)

  const key = "smoke-secret"

  const set = await secureStorage.set(key, "s3cret")
  const value = await secureStorage.get(key)
  const removed = await secureStorage.remove(key)
  const after = await secureStorage.get(key)

  app.store.set("secureOk", set && value === "s3cret" && removed && after === null)
})()

app.run()
