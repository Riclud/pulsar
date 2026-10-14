import { App, dialog, notify, screen, system, theme } from "../../../core/sdk/index.ts"

const app = new App()

void (async () => {
  const current = await theme.current()
  app.store.set("themeOk", current.scheme === "light" || current.scheme === "dark")

  const screens = await screen.list()
  app.store.set("screensOk", screens.length > 0)

  const locale = await system.locale()
  app.store.set("localeOk", typeof locale.locale === "string" && locale.locale.length > 0)

  const token = await notify.show({ title: "Pulsar", body: "Hello" })
  app.store.set("notifyToken", token)

  const files = await dialog.openFiles({ title: "Pick files" })
  app.store.set("multiOk", files.length === 1 && files[0]!.endsWith("picked.txt"))

  const dir = await dialog.openDirectory({ title: "Pick dir" })
  app.store.set("dirOk", typeof dir === "string" && dir.endsWith("picked.txt"))
})()

app.run()
