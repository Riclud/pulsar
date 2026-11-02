# API tour

The API is imported from the `pulsar` package. It has two entry points: `App`
for the application itself, and a set of modules for native capabilities. The
same modules work in `main.ts` and in UI event handlers.

```ts
import { App, fs, net, storage } from "pulsar"
```

The full option lists live in the [App API reference](../../app-api/). This page
explains how the pieces fit together and the patterns that prevent bugs.

## App

```ts
const app = new App()

app.store.set("ready", true)

app.on("window-close", () => console.log("closed"))
app.window("main").render(() => screen())
app.run()
```

| Member                              | Use                                              |
| ----------------------------------- | ------------------------------------------------ |
| `new App(config?)`                  | Create the app; config comes from `pulsar.json`. |
| `app.store`                         | Reactive JSON store shared by every window.      |
| `app.window(label?)`                | Get a window handle (first window by default).   |
| `app.createWindow(config)`          | Create a window at runtime.                      |
| `app.closeWindow(label?)`           | Close a window.                                  |
| `app.on(event, handler)`            | Subscribe to host, UI and capability events.     |
| `app.send(event, payload, target?)` | Push a one-off event to a window (`*` for all).  |
| `app.windows`                       | All open windows.                                |
| `app.manifest`                      | Parsed `pulsar.json`.                            |
| `app.quit()`                        | Quit the app.                                    |
| `app.run()`                         | No-op marker; the host owns the event loop.      |

`app.window(label).render(() => ...)` runs the function whenever the store
changes. `render` can also take a static tree.

## Store

The store is a JSON-safe reactive map. Every key is published to the UI as
`Store.<key>`.

```ts
app.store.set("count", 0)
app.store.get("count") // unknown
app.store.has("count")
app.store.delete("count")
app.store.keys()
```

Rules:

- Only plain objects, arrays, strings, finite numbers, booleans and `null` are
  accepted. Functions, class instances, `undefined`, `bigint`, `NaN` and
  `Infinity` throw.
- Circular references are rejected.
- `set` with a deeply equal value is a no-op. Polling the same payload does not
  re-render.
- Mutating an object or array in place and calling `set` with the same reference
  still produces a new JSON snapshot, but the old value comparison can surprise
  you. Create new values explicitly:

```ts
const next = tasks().map((task) => (task.id === id ? { ...task, done } : task))
app.store.set("tasks", next)
```

Derived values are functions, not extra keys:

```ts
const tasks = (): Task[] => app.store.get("tasks") as Task[]
const remaining = (): number => tasks().filter((task) => !task.done).length
```

## Windows

```ts
const panel = app.window("panel")

await panel.show()
await panel.hide()
await panel.close()
await panel.focus()
await panel.minimize()
await panel.maximize()
await panel.restore()
await panel.setTitle("Panel")
await panel.setSize(360, 260)
await panel.setPosition(100, 100)
await panel.setFullscreen(true)
await panel.setAlwaysOnTop(true)
await panel.destroy()
```

Each method returns `Promise<boolean>`. Windows declared in `pulsar.json` are
start windows; more can be created at runtime:

```ts
const settings = app.createWindow({
  label: "settings",
  ui: "ui/settings.qml",
  width: 420,
  height: 320,
})

await settings.show()
```

Omitting `ui` renders that window from TypeScript with `render`.

## Events

Window and app events:

```ts
app.on("window-close", (params) => console.log(params.label))
app.on("window-state", (params) => console.log(params.label, params.state))
app.on("window-resize", (params) => console.log(params.width, params.height))
app.on("window-move", (params) => console.log(params.x, params.y))
app.on("window-focus", () => {})
app.on("window-blur", () => {})
app.on("window-all-closed", () => app.quit())
```

Android lifecycle and back:

```ts
app.on("app-pause", (params) => saveDraft(params.state))
app.on("app-resume", () => refresh())
app.on("app-stop", () => {})
app.on("back-pressed", () => closeDialog())
```

`app-pause` fires with `"inactive"` for dialogs and the notification shade, and
with `"suspended"` when the app goes to the background. Persist durable state on
`app-pause` or `app-stop`: Android may kill a background process. While the
keyboard is open, the first back press only hides it.

Desktop and system events:

```ts
app.on("open-file", (params) => openDocument(params.path))
app.on("open-url", (params) => routeDeepLink(params.url))
app.on("second-instance", (params) => app.window().focus())
app.on("menu", (params) => runMenuAction(params.id))
app.on("tray-menu", (params) => runTrayAction(params.event))
app.on("tray-activated", () => showWindow())
app.on("theme-changed", (params) => console.log(params.scheme))
app.on("power-suspend", () => saveNow())
app.on("power-resume", () => refresh())
app.on("power-source", (params) => console.log(params.onBattery))
app.on("notification-click", (params) => focusByToken(params.token))
app.on("notification-action", (params) => handleAction(params.token, params.id))
app.on("share", (params) => importShared(params))
app.on("log", (params) => console.log(params.level, params.message))
```

UI to backend and backend to UI:

```ts
// backend -> UI
app.send("update-ready", { version: "1.2.0" })
app.window("main").emit("refresh")

// UI -> backend is the same app: call a function from an event handler
Button({ onClick: () => refresh() }, "Refresh")
```

For QML windows, subscribe through the `Pulsar` singleton and filter by
`PulsarWindowLabel`.

## Capabilities and permissions

Capabilities are the native functions behind the modules. The manifest decides
which ones an app may use:

```json
{
  "permissions": ["fs", "net", "dialog", "notify", "storage"]
}
```

When `permissions` is absent, everything is allowed. When present, only the
listed capabilities are.

| Permission    | Covers                                                      |
| ------------- | ----------------------------------------------------------- |
| `fs`          | file reads/writes, stat, rename, trash, watch               |
| `net`         | `net.fetch`, `net.request`, `net.websocket`, `net.download` |
| `paths`       | per-app data/config/cache directories                       |
| `shell`       | open URLs in the default app                                |
| `notify`      | native notifications and Android channels                   |
| `dialog`      | native open/save/message dialogs, toast                     |
| `screen`      | monitor list                                                |
| `theme`       | system color scheme, theme overrides                        |
| `system`      | locale, timezone, power state                               |
| `storage`     | JSON storage file                                           |
| `secure`      | OS keychain / secret storage                                |
| `clipboard`   | clipboard read/write                                        |
| `share`       | OS share sheet                                              |
| `device`      | orientation lock and keep-awake                             |
| `permissions` | runtime OS permission prompts                               |
| `media`       | host-backed media player                                    |
| `tray`        | tray icon and menu                                          |

Window management is core and never gated. Custom capabilities registered by
the app are also never gated.

Runtime OS permissions are separate:

```json
{ "osPermissions": ["camera", "microphone", "location", "notifications", "storage"] }
```

```ts
if (await permissions.request("camera")) startScanner()
const allowed = await permissions.check("microphone")
```

On Android these map into the manifest and `request` shows the system prompt. On
desktop both calls resolve `true`.

## Files, paths and storage

```ts
import { fs, paths, secureStorage, storage } from "pulsar"

const text = await fs.readFile("notes.txt") // utf8
const bytes = await fs.readFile("cover.png", "base64")
await fs.writeFile("notes.txt", "hello")
await fs.appendFile("notes.txt", " world")

const entries = await fs.listDir(".")
const exists = await fs.exists("notes.txt")
const info = await fs.stat("notes.txt") // size, isFile, isDirectory, mtimeMs, createdAtMs

await fs.mkdir("data/sub", true)
await fs.rename("a.txt", "b.txt")
await fs.copy("b.txt", "copy.txt")
await fs.remove("copy.txt", true)
await fs.moveToTrash("b.txt")

const stop = fs.watch("notes.txt", (path) => console.log("changed", path))
stop()

const dirs = await paths.get() // data, config, cache, temp, home
```

Use `paths.get().data` for durable app files, `.config` for settings, `.cache`
for disposable data and `.temp` for scratch files.

```ts
await storage.set("settings", { theme: "dark" })
const settings = await storage.get("settings")

await secureStorage.set("api-token", token)
const saved = await secureStorage.get("api-token")
```

`storage` is a JSON file in the app data directory. `secureStorage` keeps
strings in the OS keychain (Keychain, DPAPI or libsecret) and is scoped to the
app id. Use it for tokens and passwords, not for large data.

`fs.open(path)` hands a file to the OS. Video files open in the built-in player
when QtMultimedia is available. `fs.exportTo(path, name?)` copies a file out to
Downloads; on Android it opens the SAF save dialog.

## Network

```ts
import { net, NetError } from "pulsar"

try {
  const response = await net.fetch("https://api.example.com/items", {
    method: "GET",
    headers: { Accept: "application/json" },
    timeoutMs: 15000,
  })

  const items = JSON.parse(response.text)
} catch (error) {
  if (error instanceof NetError) {
    console.error(error.code, error.message)
  }
}
```

`net.fetch` runs in the native host, not in the JS engine. Options: `method`,
`headers`, `body` (string or `Uint8Array`), `timeoutMs`, `redirect`
(`follow`/`manual`/`error`), `maxRedirects`, `responseType`
(`text`/`binary`/`auto`) and `tlsFingerprint`.

Streaming:

```ts
const request = net.request("https://example.com/big.bin")

request.on("response", (info) => console.log(info.status))
request.on("data", (chunk) => {
  const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk
  total += bytes.byteLength
})
request.on("end", () => console.log("done", total))
request.on("error", (error) => console.error(error.code))

request.abort()
```

Download to disk with progress and resume:

```ts
const file = await net.download("https://example.com/big.zip", "big.zip", {
  resume: true,
  onProgress: (received, total) => console.log(received, total),
})

console.log(file.path, file.bytes, file.resumed)
```

WebSocket:

```ts
const socket = net.websocket("wss://example.com/ws", { protocols: ["chat"] })

socket.on("open", (info) => console.log(info.protocol))
socket.on("message", (data) => console.log(data))
socket.on("close", (info) => console.log(info.code, info.reason))
socket.on("error", (error) => console.error(error.code))

socket.send("hello")
socket.send(new Uint8Array([1, 2, 3]))
socket.close(1000, "bye")
```

`net.websocket` needs the Qt WebSockets module; the current Android Qt bundle
does not ship it, so calls there report `ERR_UNSUPPORTED`.

## Dialogs, notifications and tray

```ts
import { dialog, notify, tray } from "pulsar"

const file = await dialog.openFile({ title: "Open", filter: "Text (*.txt);;All files (*)" })
const many = await dialog.openFiles()
const dir = await dialog.openDirectory()
const saveTo = await dialog.saveFile()
await dialog.message({ title: "Pulsar", text: "Done" })
await dialog.toast("Saved")
```

```ts
const token = await notify.show({ title: "Build", body: "Finished" })

await notify.show({
  title: "Task due",
  body: "Buy milk",
  actions: [{ id: "snooze", title: "Snooze" }],
})

app.on("notification-click", (params) => focusByToken(params.token))
app.on("notification-action", (params) => runAction(params.token, params.id))

await notify.channel({ id: "reminders", name: "Reminders", importance: 3 })
```

Notification actions use the freedesktop daemon on Linux. On macOS and Windows
the notification is shown without buttons. On Android, create a channel once
and tap events arrive as `notification-click`.

```ts
await tray.setIcon("assets/icon.png")
await tray.setTooltip("My App")
await tray.setMenu([{ label: "Show", event: "show" }, { separator: true }, { label: "Quit", event: "quit" }])
```

Tray events arrive as `tray-menu` (`{ event }`) and `tray-activated`
(`{ reason }`).

## Device, media and system

```ts
import { clipboard, device, media, screen, share, system, theme } from "pulsar"

await clipboard.write("copied")
const text = await clipboard.read()

await share.text("Look at this")
await share.url("https://pulsarjs.org")
await share.file("photo.jpg", { mime: "image/jpeg" })

await device.setOrientation("landscape")
await device.setKeepAwake(true)

const screens = await screen.list()
const primary = await screen.primary()

const { locale, language, timezone } = await system.locale()
const power = await system.power()
const { scheme } = await theme.current()
```

Media player:

```ts
media.load([
  { source: "first.mp3", title: "First", artist: "Demo" },
  { source: "second.mp3", title: "Second" },
])

media.play()
media.seek(42)
media.setVolume(0.8)
media.next()

const unsubscribe = media.on((snapshot) => {
  app.store.set("player", snapshot)
})
```

The snapshot has `state` (`idle`, `loading`, `playing`, `paused`, `stopped`,
`ended`, `error`), `position`, `duration`, `rate`, `volume`, `index`, `source`,
`title`, `artist` and `playing`. On Android the player runs a foreground service
with a MediaSession and lockscreen controls.

## Menus and recent documents

```ts
app.setMenu([
  {
    label: "File",
    items: [
      { id: "new", label: "New", shortcut: "CmdOrCtrl+N" },
      { separator: true },
      { id: "hide", label: "Hide done", checked: app.store.get("hideDone") === true },
    ],
  },
])

app.on("menu", (params) => runMenuAction(params.id))

app.addRecentDocument("/home/me/notes.md")
app.clearRecentDocuments()
```

The native menu is macOS-only for now; Linux and Windows ignore `setMenu`.
Recent documents integrate with the OS recent lists.

## Custom capabilities

Register a capability to call your own code through the same permission and
event machinery:

```ts
import { callCapability, registerCapability } from "pulsar"

registerCapability("notes.count", async () => notes().length)

const count = (await callCapability("notes.count")) as number
```

Custom capabilities are not gated by the manifest. Use them to expose a stable
surface to QML windows or to isolate platform-specific code behind one function.

## Async, errors and logging

- Every capability returns a promise; await it or attach a `.catch`.
- Wrap IO in `try/catch` and put the error into the store when the UI must show
  it.
- `NetError` carries a stable `code`; branch on the code, not the message.
- An uncaught error in the dev server shows the overlay and maps stack frames
  back to TypeScript sources. In production, handle it.
- `console.log/info/debug/warn/error` goes to stderr and is forwarded to QML.
  UI logs arrive as the `log` event.

```ts
app.store.set("saving", true)

try {
  await storage.set("draft", draft())
  app.store.set("error", "")
} catch (error) {
  app.store.set("error", error instanceof Error ? error.message : String(error))
} finally {
  app.store.set("saving", false)
}
```

## Android notes

- Back hides the keyboard first, then reaches `back-pressed`; without a listener
  it quits the app.
- Persist state on `app-pause` or `app-stop`; the process can be killed in the
  background.
- `net`, `fs` and media run in the native host, not the UI thread.
- `net.websocket` is unavailable in the current Android Qt bundle.
- Use `permissions.request` for camera, microphone, location, notifications and
  storage; declare them in `osPermissions`.
- File pickers return sandboxed copies; use `fs.exportTo` to send a file back
  out.
- The dev server supports `pulsar dev --android`, `pulsar ui`, `pulsar state`,
  `pulsar tap`, `pulsar type`, `pulsar expect`, `pulsar shot` and `pulsar eval`.

## Performance and security

- Prefer `VirtualList` over rendering thousands of rows.
- Debounce search input and network calls.
- Keep the store small; large arrays are serialized and compared.
- Do not poll faster than the UI needs; deep-equal no-ops help but do not make
  polling free.
- Keep secrets in `secureStorage`, never in `storage` or source.
- Request the minimum manifest permissions and OS permissions.
- Treat files and URLs from the OS as untrusted input.
- Resolve paths under `paths.get()` instead of writing to arbitrary locations.

## A complete example

A notes screen that loads from storage, saves a draft, searches and deletes:

```ts
import {
  App,
  bind,
  Button,
  Card,
  Column,
  EmptyState,
  For,
  Header,
  IconButton,
  Input,
  Row,
  SearchField,
  Spacer,
  Text,
  storage,
} from "pulsar"

interface Note {
  id: string
  title: string
  body: string
}

const app = new App()

app.store.set("notes", [] as Note[])
app.store.set("query", "")
app.store.set("title", "")

const notes = (): Note[] => app.store.get("notes") as Note[]
const visible = (): Note[] => {
  const query = String(app.store.get("query")).toLowerCase()
  if (!query) return notes()

  return notes().filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(query))
}

const saveAll = async (next: Note[]): Promise<void> => {
  app.store.set("notes", next)
  await storage.set("notes", next)
}

const load = async (): Promise<void> => {
  const saved = await storage.get("notes")
  app.store.set("notes", Array.isArray(saved) ? (saved as Note[]) : [])
}

const add = async (): Promise<void> => {
  const title = String(app.store.get("title")).trim()
  if (!title) return

  await saveAll([{ id: String(Date.now()), title, body: "" }, ...notes()])
  app.store.set("title", "")
}

app.on("app-resume", () => void load())

app.window("main").render(() =>
  Column(
    { fill: true, padding: 16, gap: 12 },
    Header({ title: "Notes" }),
    SearchField({
      placeholder: "Search",
      value: bind(() => String(app.store.get("query"))),
      onInput: (query) => app.store.set("query", query),
    }),
    Row(
      { gap: 8, fillWidth: true },
      Input({
        placeholder: "Note title",
        value: bind(() => String(app.store.get("title"))),
        onInput: (title) => app.store.set("title", title),
        onSubmitted: () => void add(),
        expand: true,
      }),
      Button({ icon: "add", onClick: () => void add() }, "Add"),
    ),
    EmptyState({ visible: visible().length === 0, icon: "description", title: "No notes" }),
    For({
      each: visible(),
      keyOf: (note) => note.id,
      spacing: 8,
      render: (note) =>
        Card(
          { padding: 12 },
          Row(
            { gap: 8, fillWidth: true },
            Column(
              { gap: 2, expand: true },
              Text({ weight: "medium" }, note.title),
              Text({ size: 12, color: "gray" }, note.body),
            ),
            Spacer({ fillWidth: true }),
            IconButton({
              icon: "delete",
              a11yLabel: `Delete ${note.title}`,
              onClick: () => void saveAll(notes().filter((item) => item.id !== note.id)),
            }),
          ),
        ),
    }),
  ),
)

void load()
app.run()
```

## API index

| Area           | Start with                                                  |
| -------------- | ----------------------------------------------------------- |
| App            | `new App`, `app.store`, `app.on`, `app.window`, `app.send`  |
| Windows        | `WindowHandle`, `createWindow`, `setFullscreen`             |
| Files          | `fs`, `paths`, `fs.watch`, `fs.open`, `fs.exportTo`         |
| Storage        | `storage`, `secureStorage`                                  |
| Network        | `net.fetch`, `net.request`, `net.websocket`, `net.download` |
| Dialogs        | `dialog.openFile`, `dialog.saveFile`, `dialog.message`      |
| Notifications  | `notify.show`, `notify.channel`                             |
| Tray and menus | `tray`, `app.setMenu`                                       |
| Device         | `clipboard`, `share`, `device`, `permissions`               |
| Media          | `media.load`, `media.play`, `media.on`                      |
| System         | `screen`, `system.locale`, `system.power`, `theme`          |
| Custom         | `registerCapability`, `callCapability`                      |
