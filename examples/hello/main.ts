import { App } from "pulsar"
import { readdirSync } from "node:fs"
import { extname, join } from "node:path"
import { pathToFileURL } from "node:url"

const PHOTOS_DIR = process.env.PULSAR_PHOTOS ?? "/home/user/Screenshots"
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"])

function listPhotos() {
  try {
    return readdirSync(PHOTOS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IMAGE_EXT.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: entry.name, url: pathToFileURL(join(PHOTOS_DIR, entry.name)).href }))
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

const app = new App({
  ui: "ui/main.qml",
  width: 960,
  height: 640,
  title: "Hello Pulsar",
})

app.store.set("greeting", "Hello, Pulsar")
app.store.set("error", "")
app.store.set("photos", listPhotos())

let tick = 0
app.store.set("name", `tick ${tick}`)

setInterval(() => {
  tick += 1
  app.store.set("name", `tick ${tick}`)
}, 1000)

app.on("greet", (params: { name: string }) => {
  try {
    app.store.set("greeting", `Hello, ${params.name}!`)
    app.store.set("error", "")
  } catch (e) {
    app.store.set("error", e instanceof Error ? e.message : String(e))
  }
})

app.on("reloadPhotos", () => {
  app.store.set("photos", listPhotos())
})

app.run()
