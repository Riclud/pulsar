<p align="center">
  <strong>English</strong> ·
  <a href="docs/README.ru.md">Русский</a>
</p>

# Pulsar

An app framework with a declarative **TypeScript** UI and a **Bun** backend.
On the desktop it ships as a single self-contained executable; on Android it
builds an APK that runs QuickJS in one process. QML is available as an escape
hatch for advanced UI work.

- **UI**: functional components, bindings and the `Store`, written in TypeScript;
  rendered natively by QML (GPU, low memory — no Chromium).
- **Backend**: TypeScript running on [Bun](https://bun.sh).
- **Bridge**: a capability layer between the UI and the backend, plus a small
  Qt host and a C++ process supervisor.
- **Packaging**: `pulsar build` produces one file with the Bun runtime (and,
  by default, the Qt runtime) bundled in; `pulsar build --target android`
  produces a signed APK.

## Platforms

| Platform            | Release assets | Status           |
| ------------------- | -------------- | ---------------- |
| Linux x64           | yes            | tested           |
| Linux ARM64         | yes            | built in CI      |
| macOS Apple Silicon | yes            | tested           |
| macOS Intel         | yes            | built in CI      |
| Windows x64         | yes            | tested           |
| Windows ARM64       | yes            | built in CI      |
| Android ARM64       | APK only       | tested on device |

iOS is not supported yet. "Built in CI" means the toolchain and release assets
are produced and packaged, but nobody has run them on real hardware.

Documentation lives at [pulsarjs.org](https://pulsarjs.org). See
[CHANGELOG.md](CHANGELOG.md) for the release history.

## Requirements

- **[Bun](https://bun.sh) ≥ 1.2** — the CLI and every app run on Bun.
- **Qt 6.8+** (Qt **6.9.2+** on macOS — older 6.8.x links the removed AGL
  framework) — only if you build the host from source or use the `--slim`
  toolchain (`pulsar build --slim` / `pulsar install --slim`). The default
  toolchain and builds bundle Qt, so end users need nothing extra; its platform
  dependencies (X11/Wayland, fonts, GPU drivers) still come from the system.
  Building from source also needs the Qt WebSockets module; QtMultimedia is
  optional and enables the in-app desktop video player.

## Install

### From a release (recommended)

Prebuilt assets are published for every desktop target listed above.

Linux / macOS:

```sh
curl -fsSL https://get.pulsarjs.org | sh
pulsar install          # downloads the native toolchain (host + bridge + Qt)
```

Windows:

```powershell
iwr https://get.pulsarjs.org/install.ps1 -UseBasicParsing | iex
pulsar install
```

The bootstrap installs the CLI to `~/.local/share/pulsar` (or
`%LOCALAPPDATA%\pulsar` on Windows) and a `pulsar` shim on your `PATH`.
`pulsar install` then fetches the platform toolchain:

- default: **fat** — bundles Qt, zero configuration. The host loads it from the
  bundle (via RPATH on Linux/macOS, from DLLs next to the executable on Windows),
  so a system Qt is never used;
- `--slim` — no Qt, uses the system one.

The toolchain is fetched from GitHub Releases together with the CLI; Qt is not
downloaded separately. Only building the framework from source or using `--slim`
requires a system Qt 6.8+.

### From source

```sh
git clone https://github.com/riclud/pulsar
cd pulsar
bun install
cmake -S . -B build && cmake --build build   # builds qml-host, bridge and launcher into build/bin/
bun cli/index.ts doctor   # verify
```

Requires CMake, a C++20 compiler and a Qt 6 development installation
(`qmake`/`pkg-config`). See "Building from source" below.

## Quick start

```sh
pulsar create my-app      # default: TypeScript UI (templates: default, qml, windows, tray)
cd my-app
pulsar dev                # run with hot reload
```

`my-app` looks like this:

```
my-app/
  pulsar.json     # app manifest: id, windows, entry point
  main.ts         # UI + state + events, all in TypeScript
  assets/icon.png
  package.json
  tsconfig.json
```

`main.ts`:

```ts
import { App, Button, Column, Header, Text } from "pulsar"

const app = new App()

app.store.set("count", 0)

app
  .window("main")
  .render(() =>
    Column(
      { fill: true },
      Header({ title: "Hello from Pulsar" }),
      Text({ size: 20, text: `Count: ${app.store.get("count")}` }),
      Button({ onClick: () => app.store.set("count", (app.store.get("count") as number) + 1) }, "+1"),
    ),
  )

app.run()
```

No QML files. `pulsar.json` supplies the window defaults, so `new App()` needs
no arguments. Advanced users can switch a window to QML with `"ui": "ui/main.qml"`
and start from `pulsar create my-app --template qml`.

## CLI

```
pulsar <command>

  create <name>  scaffold a new app (--template default|js|qml|windows|tray)
  install        download the native toolchain for this platform (--android for APK)
  update         update the CLI to the latest release
  dev            run with hot reload (watch sources)
  run            run the app in the current directory
  build          build a single-file executable (--target desktop|android|portable)
  doctor         check the toolchain (host, bridge, Qt, Bun)
  version        print the version
  help           show help
```

Useful flags and aliases:

| Command         | Flags                                                      |
| --------------- | ---------------------------------------------------------- |
| `create <name>` | `--template <t>`, `--dir <path>`, `--force`                |
| `install`       | `--version <v>\|latest`, `--slim`, `--android`             |
| `build`         | `--out <dir>` / `-o <dir>`, `--slim`, `--target`, `--abi`  |
| `run`, `dev`    | env `PULSAR_APP` (app dir), `PULSAR_WATCH` (`dev` sets it) |
| `init`          | legacy alias for `create` in the current directory         |

`pulsar build` writes `dist/<name>` — one executable containing the Bun
runtime, your app and (unless `--slim`) the Qt runtime. Run it directly:
`./dist/<name>`.

### Android

Android runs the QuickJS engine and the QML host in-process, so the app must be
portable: add `"targets": ["android"]` and `"compat": "portable"` to
`pulsar.json`, then:

```sh
pulsar build --target android
```

The first build installs what it needs into `PULSAR_HOME` (one time, ~2 GB):
JDK 17, the Android SDK/NDK and the Qt for Android bundle with matching host
tools. The result is `dist/<name>.apk` for `arm64-v8a` (minSdk 28, targetSdk
35). `pulsar install --android` performs the same setup without building, and
`pulsar check --target android` rejects `node:`/`bun:` imports before packaging.

`net.fetch` and streaming `net.request` work on Android: transport runs in the
native host through QtNetwork. `net.websocket` needs the Qt WebSockets module,
which the current Android Qt bundle does not ship; calls report
`ERR_UNSUPPORTED` there (desktop builds are unaffected).

#### Android dev loop

```sh
pulsar dev --android
```

The first run builds a dev APK (`applicationId <id>.dev`, label
`<name> (dev)`) and installs it next to production. The CLI starts a bundle
server, points the app at it through `adb reverse`, watches the app directory
and restarts the app after an edit (1–2 s). Native inputs (host C++, the
manifest, CMake, the app id) are fingerprinted; when they change the APK is
rebuilt and reinstalled. Flags: `--device <serial>`, `--port <n>`,
`--no-install`, `--force-install`, `--no-keep-awake`.

While it runs, another terminal can inspect and drive the app:

```sh
pulsar ui                 # UI tree (JSON)
pulsar state              # store snapshot (JSON)
pulsar tap "Add"          # press by text, path or id
pulsar type "milk" --into "New task"
pulsar expect "milk"      # wait for text
pulsar shot --out shot.png
pulsar tap --at 540,1200          # coordinates (QML apps, system UI)
pulsar swipe 500 1200 500 400 --duration 250
pulsar key back                   # back, home, enter, ... or a numeric code
pulsar ui --system                # uiautomator dump of the foreground screen
pulsar eval "6*7"                 # evaluate JS in the running QuickJS context
```

`pulsar shot` uses `adb` and captures the whole screen; `--window` grabs only
the app window over the dev channel. The semantic commands need a JS UI tree,
so they apply to JS-rendered windows, not `ui/main.qml` apps. `pulsar ui
--system` dumps the foreground window (useful for permission dialogs), and
`--at`/`swipe`/`key` drive the screen by coordinates.

Flow tests can use the host API:

```ts
import { connect } from "../../cli/testing.ts"

const app = connect()

await app.tap({ text: "Add" })
await app.expect("count=1")
await app.shot(".pulsar/shots/after.png")
```

Run it with `bun flows/todo.ts` while `pulsar dev --android` is running.

An uncaught error shows a full-screen overlay with a Reload button. While the
dev server runs, stack frames are mapped back to your TypeScript sources in the
terminal and in the overlay.

Edits reload the app in process (~200 ms on the device): the JS runtime is
recreated and the store is seeded from the previous session. JS windows keep
their view; QML windows are reloaded from `ui/main.qml`. Because the store is
preserved, changing an initial `app.store.set` value in code does not take
effect until a full restart (`pulsar dev` again).

## The manifest — `pulsar.json`

One file drives the app config and packaging.

```json
{
  "id": "com.example.myapp",
  "name": "my-app",
  "version": "1.0.0",
  "main": "main.ts",
  "icons": { "linux": "assets/icon.png", "macos": "assets/icon.icns", "windows": "assets/icon.ico" },
  "windows": [
    {
      "label": "main",
      "ui": "ui/main.qml",
      "width": 800,
      "height": 600,
      "title": "My App",
      "minWidth": 400,
      "minHeight": 300,
      "resizable": true,
      "frameless": false,
      "transparent": false,
      "icon": "assets/icon.png"
    }
  ],
  "permissions": [],
  "osPermissions": ["camera", "microphone"],
  "fileAssociations": [{ "ext": "md", "mime": "text/markdown", "name": "Markdown document" }],
  "protocols": [{ "scheme": "myapp" }],
  "singleInstance": true
}
```

| Field              | Meaning                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Reverse-DNS id; used for per-app data/config/cache directories.                                                                                                |
| `name`             | Display/output name (also the `dist/<name>` file name).                                                                                                        |
| `version`          | App version.                                                                                                                                                   |
| `main`             | Backend entry point relative to the manifest (default `main.ts`).                                                                                              |
| `icons`            | Per-platform icon paths (used by packaging).                                                                                                                   |
| `windows[]`        | Initial windows: `label`, `ui`, `width`, `height`, `title`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `resizable`, `frameless`, `transparent`, `icon`. |
| `permissions`      | Capabilities the app may use (see [Permissions](#permissions)). Absent = all.                                                                                  |
| `osPermissions`    | Runtime OS permissions to declare in the Android manifest: `camera`, `microphone`, `location`, `notifications`, `storage`.                                     |
| `protocols`        | Custom URL schemes (deep links) the app handles.                                                                                                               |
| `fileAssociations` | File types the app opens: `ext` (without the dot), `mime`, `name`.                                                                                             |
| `singleInstance`   | Forward a second launch to the running instance and exit (default `false`).                                                                                    |
| `ignore`           | Extra paths left out of builds, in `.gitignore` syntax.                                                                                                        |

Builds always skip `.git`, `node_modules`, `dist`, `build`, `.cache`,
`.pulsar`, `.env*` and `sync.db*`, and honour the app's root `.gitignore`.
`ignore` adds patterns on top of that; a `!` entry re-includes a path ignored
by `.gitignore`, but never one of the built-in exclusions.

`App` derives its config from the first manifest window; explicit options
passed to `new App({...})` override the manifest.

### Transparent windows

`"transparent": true` on a window clears its background, forces frameless and
draws a rounded translucent surface. The blur itself is done by the compositor;
for Hyprland:

```ini
windowrulev2 = opacity 0.94 0.88,class:^(pulsar-host)$
windowrulev2 = blur,class:^(pulsar-host)$
windowrulev2 = rounding 18,class:^(pulsar-host)$
```

Check the class with `hyprctl clients`. Without blur transparency still works,
but the frosted look is weaker.

### Native menu bar

```ts
app.setMenu([
  {
    label: "File",
    items: [
      { id: "new", label: "New task", shortcut: "CmdOrCtrl+N" },
      { separator: true },
      { id: "hide", label: "Hide done", checked: app.store.get("hideDone") === true },
    ],
  },
])

app.on("menu", ({ id }) => {
  if (id === "new") app.store.set("composing", true)
})
```

The menu is built natively in the macOS global menu bar; Linux and Windows
currently ignore it. Call `setMenu` again to refresh `checked` states. An item
with `items` becomes a submenu; choosing a leaf emits `menu` with its `id`.

### Permissions

`permissions` declares the OS-facing capabilities the app may use. When the
field is **absent** every capability is allowed; when **present** only the
listed ones are, and any other capability call fails with a `permission denied`
error.

```json
{ "permissions": ["fs", "net", "dialog"] }
```

| Permission    | Grants                                       |
| ------------- | -------------------------------------------- |
| `fs`          | filesystem reads/writes, stat, rename, trash |
| `net`         | `net.fetch`, `net.request`, `net.websocket`  |
| `paths`       | standard per-app directories                 |
| `shell`       | open URLs in the default application         |
| `notify`      | native notifications                         |
| `dialog`      | native file/message dialogs                  |
| `screen`      | monitor list                                 |
| `theme`       | system color scheme                          |
| `system`      | locale/language/timezone                     |
| `storage`     | the app's JSON storage file                  |
| `secure`      | OS keychain / secret storage                 |
| `tray`        | system tray icon and menu                    |
| `clipboard`   | system clipboard read/write                  |
| `share`       | OS share sheet                               |
| `device`      | orientation lock and keep-awake              |
| `permissions` | runtime OS permission prompts                |
| `media`       | host-backed media playback                   |

Window management is core and is not gated. Custom capabilities registered by
the app are never gated either.

Runtime permission prompts are separate from capabilities. List what the app
may ask for in `osPermissions` and request it at runtime:

```ts
import { permissions } from "pulsar"

if (await permissions.request("camera")) startScanner()
const granted = await permissions.check("microphone")
```

Names: `camera`, `microphone`, `location`, `notifications`, `storage`. On
Android they are mapped into the manifest and `request` shows the system
prompt; on desktop both calls resolve `true`.

## App API (backend / TypeScript)

```ts
import {
  App,
  Store,
  WindowHandle,
  fs,
  net,
  paths,
  shell,
  storage,
  secureStorage,
  dialog,
  notify,
  screen,
  system,
  theme,
  tray,
  clipboard,
  device,
  media,
  permissions,
  share,
  callCapability,
  registerCapability,
} from "pulsar"
```

### App

| Member                               | Description                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `new App(config?)`                   | Create the app. Config comes from `pulsar.json`; `config` overrides it. |
| `app.store`                          | Reactive state shared with all windows (see `Store`).                   |
| `app.on(event, fn)`                  | Subscribe to an event from QML (`Pulsar.emit`), the host or `app.send`. |
| `app.window(label?)`                 | Get a `WindowHandle` (defaults to the first window).                    |
| `app.createWindow(config)`           | Create a window at runtime; returns a `WindowHandle`.                   |
| `app.closeWindow(label?)`            | Close a window (defaults to the first).                                 |
| `app.send(event, payload?, target?)` | Send an event to the UI (`target` label, or `*`).                       |
| `app.windows`                        | All open windows (start windows plus created ones).                     |
| `app.config`                         | The first window's config.                                              |
| `app.manifest`                       | The parsed `pulsar.json` (or `null`).                                   |
| `app.quit()`                         | Quit the application.                                                   |
| `app.run()`                          | No-op marker; the host owns the event loop.                             |

### Store

A JSON-safe reactive map. Every change is pushed to QML as `Store.<key>`.

```ts
app.store.set("count", 0)
app.store.get("count") // unknown -> cast
app.store.has("count")
app.store.delete("count")
app.store.keys()
app.store.set("items", [{ id: 1 }, { id: 2 }])
```

Only JSON-serializable values are allowed (objects, arrays, strings, finite
numbers, booleans, `null`). Everything else throws a descriptive error; use
`delete` instead of setting `undefined`. Circular references are rejected.

Values are compared by reference: setting the same reference does nothing, and an
equal copy counts as a change. A render that read a key runs again when it changes,
and nothing else does. Keys added
after the window is open are pushed as usual; bind them directly
(`Store.<key>`) so QML tracks them.

### Windows

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
await panel.destroy() // close and drop the window
```

Each method returns a `Promise<boolean>`. Windows declared in `pulsar.json` are
just start windows — create more at runtime:

```ts
const settings = app.createWindow({ label: "settings", ui: "ui/settings.qml", width: 420, height: 320 })
await settings.show()
```

### Lifecycle events

The host reports window and tray activity back to the app:

```ts
app.on("window-close", (params) => console.log("closed", params.label))
app.on("window-state", (params) => console.log(params.label, params.state)) // normal|minimized|maximized|fullscreen
app.on("window-resize", (params) => console.log(params.label, params.width, params.height))
app.on("window-move", (params) => console.log(params.label, params.x, params.y))
app.on("window-focus", () => {})
app.on("window-blur", () => {})
app.on("window-all-closed", () => app.quit())
```

On Android the app also receives foreground and back-button events:

```ts
app.on("app-pause", (params) => saveDraft(params.state)) // "inactive" | "suspended"
app.on("app-resume", () => refresh())
app.on("app-stop", () => {}) // went to background; Android may kill the process
app.on("back-pressed", () => closeDialog()) // no listener: back quits the app
```

`app-pause` with `state: "inactive"` also fires for dialogs and the notification
shade, so persist durable state there (or on `app-stop`): Android can kill a
background process without further callbacks. While the software keyboard is
open, the first back press only hides it. These events never fire on desktop.

### Screens and the router

`createRouter(app)` keeps a screen stack for TypeScript-rendered apps. Push and
pop publish the current route to `Store` (under `route` by default), so the UI
re-renders, and the system back button pops the stack:

```ts
import { createRouter } from "pulsar"

const router = createRouter(app)

router.push("settings", { tab: "general" })
router.replace("settings")
router.pop() // false at the root

app.window("main").render(() =>
  router.view({
    home: () => HomeScreen(),
    settings: (params) => SettingsScreen({ tab: params.tab as string }),
  }),
)
```

`Router` methods: `current()`, `entries()`, `canGoBack()`, `depth()`,
`push(name, params?)`, `replace(name, params?)`, `pop()`,
`reset(name?, params?)`, `subscribe(fn)` and `view(screens)`. Back pops the
stack and quits the app when the stack is empty; pass `handleBack: false` to
disable that. `storeKey` renames the published store key, and `initial` sets the
first route (default `"home"`).

### Launch arguments & deep links

Files and URLs the OS hands the app (command-line arguments, or a macOS file
open) arrive as events:

```ts
app.on("open-file", (params) => console.log("open", params.path))
app.on("open-url", (params) => console.log("deep link", params.url))
```

With `singleInstance: true` in `pulsar.json` only one instance runs: a second
launch forwards its arguments to the running app and exits. The running app
gets a `second-instance` event so it can raise its window:

```ts
app.on("second-instance", (params) => {
  app.window().focus()
  console.log("relaunched with", params.argv)
})
```

### Recent documents

Tell the OS which files the user opened; they show up in the system recent
lists (Jump List on Windows, the app's recents on macOS, `recently-used.xbel`
on Linux):

```ts
app.addRecentDocument("/home/me/notes.md")
app.clearRecentDocuments()
```

Paths are resolved to absolute. Clearing empties the list for this app (on
Linux the shared `recently-used.xbel` is reset).

### File associations

Declare the file types the app opens in `pulsar.json`:

```json
"fileAssociations": [
  { "ext": "md", "mime": "text/markdown", "name": "Markdown document" }
]
```

On launch the host registers them idempotently: on Linux it writes a desktop
entry to `$XDG_DATA_HOME/applications` and a default in
`$XDG_CONFIG_HOME/mimeapps.list` (so `mime` is required there); on Windows it
adds the app to `OpenWithProgids` under `HKCU\Software\Classes`. macOS file
types belong to app bundles, so single-file builds ignore this field — use
`protocols` for deep links there.

### Backend → UI events

`app.send(event, payload, target?)` pushes a one-off event to the UI (`target` is
a window label or `*` for every window). `app.window(label).emit(...)` targets a
single window. In QML subscribe through the `Pulsar` singleton and filter by the
`PulsarWindowLabel` context property:

```ts
app.send("update-ready", { version: "0.2.0" })
```

```qml
Connections {
    target: Pulsar
    function onAppEvent(event, payload, target) {
        if (target === "*" || target === PulsarWindowLabel)
            if (event === "update-ready") banner.text = "Update " + payload.version
    }
}
```

### Dialogs

Native, implemented by the Qt host.

```ts
import { dialog } from "pulsar"

const path = await dialog.openFile({ title: "Open", filter: "Images (*.png *.jpg);;All files (*)" })
if (path) app.store.set("picked", path)

const saveTo = await dialog.saveFile({ title: "Save as" })
await dialog.message({ title: "Pulsar", text: "Done!" })
```

### Tray

```ts
import { tray } from "pulsar"

await tray.setIcon((process.env.PULSAR_APP ?? ".") + "/assets/icon.png")
await tray.setTooltip("My App")
await tray.setMenu([{ label: "Show", event: "show" }, { separator: true }, { label: "Quit", event: "quit" }])

app.on("tray-menu", (data: { event?: string }) => {
  if (data.event === "show") app.window().show()
  if (data.event === "quit") app.quit()
})
```

Tray emits `tray-menu` (`{ event }`) when an item is clicked and
`tray-activated` (`{ reason }`) when the icon is activated.

### Media player

`media` drives one host-backed player with a JS playlist. On Android it runs a
foreground service with a MediaSession and lockscreen controls.

```ts
import { media } from "pulsar"

media.load([
  { source: "/path/first.mp3", title: "First", artist: "Demo" },
  { source: "https://example.com/second.mp3", title: "Second" },
])
media.play()

const unsubscribe = media.on((snapshot) => {
  app.store.set("player", snapshot)
})

media.seek(42) // seconds
media.setRate(1.25)
media.setVolume(0.8)
media.next()
```

The snapshot carries `state` (`idle`, `loading`, `playing`, `paused`, `stopped`,
`ended` or `error`), `position`, `duration`, `rate`, `volume`, `index`,
`source`, `title`, `artist` and `playing`. Other methods: `pause()`, `toggle()`,
`stop()`, `previous()`, `setMetadata(title, artist?)`, `state()` and
`playlist()`.

### File system, paths, network, shell, storage

```ts
import { fs, paths, net, storage } from "pulsar"

const text = await fs.readFile("notes.txt") // utf8 by default
await fs.writeFile("notes.txt", "hello")
await fs.appendFile("notes.txt", " world")
const entries = await fs.listDir(".")
const exists = await fs.exists("notes.txt")
const info = await fs.stat("notes.txt") // { size, isFile, isDirectory, mtimeMs, createdAtMs }

await fs.mkdir("data/sub", true)
await fs.rename("a.txt", "b.txt")
await fs.copy("b.txt", "copy.txt")
await fs.remove("copy.txt") // recursive: fs.remove(path, true)
await fs.moveToTrash("b.txt")

const stop = fs.watch("notes.txt", (path) => console.log("changed", path))
stop() // unsubscribe; watches are reference-counted per path

await fs.open("report.pdf") // open with the OS default app
await fs.exportTo("report.pdf", "report.pdf") // copy out to Downloads

const bytes = await fs.readFile("logo.png", "base64") // binary as base64
await fs.writeFile("logo.png", bytes, "base64")

const dirs = await paths.get() // { data, config, cache, temp, home }

const res = await net.fetch("https://api.example.com/items") // { status, statusText, url, headers, text }
const created = await net.fetch("https://api.example.com/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "demo" }),
})
const logo = await net.fetch("https://example.com/logo.png", { responseType: "binary" })
logo.bytes // Uint8Array

await shell.open("https://github.com/riclud/pulsar")

await storage.set("todos", [{ id: 1, text: "write docs" }])
const todos = await storage.get("todos")
await storage.remove("todos")
```

`net.fetch(url, options)` runs in the native host, not in the JS engine, so it
works the same under Bun, Node, Hermes or QuickJS. Options: `method`, `headers`,
`body` (string or `Uint8Array`), `bodyFile` (a path the host streams), `timeoutMs`
(idle time), `redirect` (`follow` / `manual` / `error`), `maxRedirects`,
`responseType` (`text` / `binary` / `auto`), `maxBytes` (64 MB by default, `0` for no
limit) and `tlsFingerprint`. `tlsFingerprint: true` (or a profile such as `"chrome120"`)
is reserved for the impersonating backend; builds without it reject with
`ERR_FINGERPRINT_UNAVAILABLE`.

Use `net.request(url, options)` for streaming: it emits `response`, `data`
(string or `Uint8Array`), `end` and `error`, and has `abort()`:

```ts
const request = net.request("https://example.com/big.bin")
request.on("data", (chunk) => console.log(chunk))
request.on("end", () => console.log("done"))
request.on("error", (error) => console.error(error.code, error.message))
```

`net.websocket(url, options)` opens a `ws://` or `wss://` connection in the
native host. Options: `headers`, `protocols` (subprotocols) and `timeoutMs`
(connect timeout, default 30s). Messages are strings or `Uint8Array`s:

```ts
const socket = net.websocket("wss://example.com/ws", { protocols: ["chat"] })

socket.on("open", (info) => console.log("connected", info.protocol))
socket.on("message", (data) => console.log(typeof data === "string" ? data : data.byteLength))
socket.on("close", (info) => console.log(info.code, info.reason, info.wasClean))
socket.on("error", (error) => console.error(error.code, error.message))

socket.send("hello")
socket.send(new Uint8Array([1, 2, 3]))
socket.close(1000, "bye")
```

`net.download(url, path, options)` writes a response straight to disk:
`headers`, `timeoutMs`, `resume` (continue a partial file with a Range request
when the server allows it) and `onProgress(received, total)`. It resolves with
`{ path, bytes, resumed, status, statusText, url, headers }`.

```ts
const file = await net.download("https://example.com/big.zip", "big.zip", {
  resume: true,
  onProgress: (received, total) => console.log(received, total),
})
```

`fs.watch(path, listener)` reports changes to a file or directory and returns an
unsubscribe function; watches are reference-counted per path.

`fs.open(path)` hands a file to the OS. Videos play in a full-screen built-in
player: on Android always, on desktop when the Qt install has QtMultimedia
(the bundled toolchains do). Other files go to the default application on
desktop (`QDesktopServices`) or `ACTION_VIEW` on Android. `fs.exportTo(path, name?)` copies a file out of
the app sandbox into the user's Downloads folder; on Android it opens the SAF
save dialog and returns `true` once the copy succeeded. Both return
`Promise<boolean>`. `dialog.toast(text)` shows a short Android toast; on
desktop it is a no-op that resolves `true`.

Native dialogs live in `dialog`:

```ts
import { dialog } from "pulsar"

const one = await dialog.openFile({ title: "Open", filter: "Images (*.png *.jpg);;All files (*)" })
const many = await dialog.openFiles({ title: "Open several" })
const dir = await dialog.openDirectory({ title: "Choose a folder" })
const saveTo = await dialog.saveFile({ title: "Save as" })
await dialog.message({ title: "Pulsar", text: "Done!" })
await dialog.toast("Saved")
```

### Clipboard, sharing, device

```ts
import { clipboard, device, share } from "pulsar"

await clipboard.write("copied text")
const text = await clipboard.read()

await share.text("Look at this") // share sheet on Android, clipboard on desktop
await share.url("https://github.com/riclud/pulsar")
await share.file("/path/to/photo.jpg", { mime: "image/jpeg" })

await device.setOrientation("landscape") // "auto" unlocks; Android only
await device.setKeepAwake(true) // keep the screen on while foregrounded
```

`share.*` resolves `true` once the content was handed off. `device` calls only
have an effect on Android.

### Notifications, screens, theme, locale

```ts
import { notify, screen, system, theme } from "pulsar"

const token = await notify.show({ title: "Pulsar", body: "Build finished" })
app.on("notification-click", (data) => {
  if (data.token === token) app.window().focus()
})

await notify.show({
  title: "Task due",
  body: "Buy milk",
  actions: [{ id: "snooze", title: "Snooze" }],
})
app.on("notification-action", (data) => {
  if (data.id === "snooze") app.store.set("snoozed", data.token)
})

const screens = await screen.list() // [{ name, x, y, width, height, workArea, scale, primary }]
const mainScreen = await screen.primary()

const { scheme } = await theme.current() // "light" | "dark"
app.on("theme-changed", (data) => console.log("now", data.scheme))

const { locale, language, timezone } = await system.locale()

const power = await system.power() // { known, source: "ac" | "battery" | "unknown", onBattery, percent? }
app.on("power-suspend", () => saveNow())
app.on("power-resume", () => refresh())
app.on("power-source", ({ onBattery }) => console.log(onBattery ? "battery" : "ac"))
```

Power events and state come from logind and UPower on Linux (system D-Bus), with
a `/sys/class/power_supply` fallback for the source. On other platforms
`system.power()` reports `source: "unknown"` and the events do not fire.

`theme.set(options)` overrides the palette, custom color tokens, density, fonts
and motion at runtime:

```ts
import { catppuccinTheme, defineTheme, theme } from "pulsar"

declare module "pulsar" {
  interface ThemeColors {
    brand: string
  }
}

const brand = defineTheme({ colors: { brand: "#ff5c8a" } })

await theme.set({
  palette: { primary: "#7c5cff", surface: "#16161a", text: "#f5f5f7" },
  colors: brand.colors, // now `color: "brand"` is type-checked
  density: 0.9, // spacing and radii multiplier
  fontScale: 1.1,
  fontFamily: "Inter",
  iconFamily: "Material Symbols Rounded",
  motion: { fast: 90, normal: 160, slow: 260 },
})

await theme.set(catppuccinTheme("latte")) // "frappe" is the default
```

`palette` keys: `background`, `surface`, `surfaceVariant`, `primary`, `text`,
`textSecondary`, `border`, `layer3`, `layer4`, `radius` and `spacing`. Colors
accept named CSS colors, hex and `rgb()`/`hsl()` strings. Catppuccin presets
are exported as `catppuccin.frappe`, `catppuccin.latte` and
`catppuccinTheme(flavor)`. The bundled UI font is Paper Mono; icons default to
Material Symbols Rounded when installed.

Notification action buttons use the freedesktop notification daemon on Linux;
on macOS and Windows the notification is shown without buttons and
`notification-action` never fires. On Android, create a channel once with
`notify.channel({ id, name, importance })`; text shared into the app from other
apps arrives as a `share` event (`{ text?, url?, files? }`).

Storage persists JSON-safe values to `storage.json` in the per-app data
directory. `paths` returns the standard per-OS directories:

| OS      | data/config                                    | cache                       |
| ------- | ---------------------------------------------- | --------------------------- |
| Linux   | `$XDG_DATA_HOME/<id>`, `$XDG_CONFIG_HOME/<id>` | `$XDG_CACHE_HOME/<id>`      |
| macOS   | `~/Library/Application Support/<id>`           | `~/Library/Caches/<id>`     |
| Windows | `%APPDATA%\<id>`                               | `%LOCALAPPDATA%\<id>\cache` |

### Secrets (OS keychain)

`secureStorage` keeps strings in the OS secret store: Keychain on macOS, DPAPI
on Windows, libsecret (`secret-tool`) on Linux and the Keystore on Android. Entries are scoped to the
app `id`, so apps never see each other's values.

```ts
import { secureStorage } from "pulsar"

if (await secureStorage.available()) {
  await secureStorage.set("api-token", token)
  const saved = await secureStorage.get("api-token") // string | null
  await secureStorage.remove("api-token")
} else {
  // Linux without libsecret: fall back to the plain JSON store.
}
```

`available()` is `false` when the platform backend is missing (typically Linux
without `secret-tool`). Values are UTF-8 strings; serialize objects to JSON
first. On Windows the blob is encrypted with DPAPI for the current user; on
macOS and Linux access control is enforced by the OS keychain.

### Logging

```ts
console.log("hello") // -> stderr, and forwarded to QML
console.error("oops") // levels: log, info, debug, warn, error
```

App logs are also emitted to QML through the `log` signal. QML `console.*`
messages are forwarded back to the app as a `log` event:

```ts
app.on("log", (params: { level: string; source: "qml" | "js"; message: string; file?: string; line?: number }) => {
  // source is "qml" for messages from the UI
})
```

## UI in TypeScript

A window declared **without `ui`** is rendered from a tree built in TypeScript.
`pulsar create my-app` scaffolds exactly this — no QML files. Components are
plain functions, props are plain objects, and events use web names: `onClick`,
`onInput`, `onToggle`, `onChange`, `onClose`.

```ts
import {
  App,
  component,
  Button,
  Card,
  Checkbox,
  Column,
  For,
  Header,
  IconButton,
  Input,
  Sheet,
  Row,
  Spacer,
  Text,
} from "pulsar"

interface Task {
  id: string
  text: string
  done: boolean
}

const app = new App()

app.store.set("tasks", [
  { id: "1", text: "Try the JS UI", done: true },
  { id: "2", text: "Write my first app", done: false },
] as Task[])

const tasks = (): Task[] => app.store.get("tasks") as Task[]

const TaskRow = component<{ key: string; task: Task }>(({ task }) =>
  Card(
    { padding: 12 },
    Row(
      { gap: 8, fillWidth: true },
      Checkbox({
        label: task.text,
        checked: task.done,
        onToggle: (done) =>
          app.store.set(
            "tasks",
            tasks().map((item) => (item.id === task.id ? { ...item, done } : item)),
          ),
      }),
      Spacer({ fillWidth: true }),
      IconButton({
        icon: "delete",
        onClick: () =>
          app.store.set(
            "tasks",
            tasks().filter((t) => t.id !== task.id),
          ),
      }),
    ),
  ),
)

app.window("main").render(() =>
  Column(
    { fill: true },
    Header({
      title: "My tasks",
      subtitle: `${tasks().filter((task) => !task.done).length} left`,
      actions: [IconButton({ icon: "add", onClick: () => app.store.set("editing", true) })],
    }),
    Text({ visible: tasks().length === 0, size: 16 }, "Nothing here yet"),
    For({
      each: tasks(),
      keyOf: (task) => task.id,
      spacing: 8,
      padding: 12,
      render: (task) => TaskRow({ key: task.id, task }),
    }),
    Sheet(
      {
        open: app.store.get("editing") === true,
        title: "New task",
        fullscreen: true,
        onClose: () => app.store.set("editing", false),
      },
      Input({ placeholder: "What needs doing?" }),
      Button({ expand: true }, "Add task"),
    ),
  ),
)

app.run()
```

`render` takes a tree or a function; the function runs again when a value it read
changes, and the host updates the existing QML objects in place, so focus,
scroll and input state survive a re-render.

| Group                  | Components                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout                 | `Column`, `Row`, `Box`, `Scroll`, `Spacer`, `Divider`, `Container`, `Grid`, `VirtualList`, `Zoomable`                                                                                     |
| Content                | `Text` (Markdown too), `Image`, `Icon`, `Avatar`, `Badge`, `Chip`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`                                                                        |
| Actions                | `Button`, `IconButton`, `Fab`                                                                                                                                                             |
| Input                  | `Input`, `TextArea`, `SearchField`, `Checkbox`, `Switch`, `RadioGroup`, `Slider`, `RangeSlider`, `Select`, `Segmented`                                                      |
| Navigation & structure | `For`, `Card`, `Header`, `Toolbar`, `NavigationRail`, `NavBar`, `Tabs`, `Pager`, `Modal` (`Sheet`, `BottomSheet`), `Popover`, `Snackbar`, `Menu`, `Accordion` |

- Values are read while rendering, and functions in `on*` props are event handlers.
- `For({ each, keyOf, render })` builds a scrollable list and keeps rows stable by key.
- `Sheet` is an in-tree overlay, so it behaves the same on desktop and
  Android. It fades in and out (opacity only, `duration` in ms), swallows taps
  inside the panel, and does not close from the gesture that opened it. Pass
  `dismissible: false` to disable closing on a backdrop tap.
- `Icon` and `IconButton` take [Material Icons](https://fonts.google.com/icons)
  names such as `add`, `delete`, `edit`, `check`, `arrow_back`, `close`.
- `Card`, `Box`, `Button`, `Fab`, `Menu` and `Popover` accept `elevation` (a
  shadow level) and `shadowColor`. Shadows use `MultiEffect` and work on every
  platform Qt supports. `Card` and `Box` also take `gradient: { from, to,
direction }`, `borderColor`, `borderWidth` and `radius`.
- `SearchField` adds a search icon, a clear button and optional `debounce` (ms)
  before `onInput` fires. `onSubmit` fires on Enter.
- `RadioGroup({ options, value, onChange })` handles exclusive selection;
  `Radio` is the standalone control.
- `RangeSlider({ min, max, from, to, onChange })` reports both handles;
  `Slider` keeps the single-value API.
- `Menu({ open, items, onSelect, onClose })` is a floating overlay: `items`
  supports `icon`, `shortcut`, `disabled`, `separator` and `danger`. Esc and a
  click outside close it. `Accordion(...)` with `AccordionSection({ title,
icon, defaultOpen })` sections keeps the open state locally and reports
  toggles through `onChange`.
- `Toolbar(...)` is a surface row for a title and actions. `Fab({ icon,
placement: "bottom-end" })` floats above the content; use `placement:
"inline"` to keep it in the layout.
- `EmptyState({ icon, title, text, action })` is the standard empty placeholder.
- `NavBar({ items, value, onChange })` is the bottom navigation bar for narrow
  screens; `NavigationRail` stays the wide-screen sidebar. `Container({ maxWidth,
padding })` caps and centers content on large windows.
- `Grid({ columns: "auto", minColumnWidth: 180 })` derives the column count from
  the available width instead of a fixed number.
- `Avatar({ src, name, size, status, badge })` falls back to initials;
  `Badge({ count | dot, label })` is also available standalone. Icons, icon
  buttons and buttons accept `badge` (a count or `"dot"`) as well.
- `Skeleton({ variant: "text" | "rect" | "circle", width, height })` is a pulsing
  placeholder. `Spinner({ size, value })` spins when `value` is omitted and shows
  determinate progress for `0..1`.
- `TextArea` (or `Input({ multiline: true })`) is a multiline field. Inputs also
  take `password`, `keyboardType`, `autoFocus`, `maxLength`, `readOnly` and
  `onSubmitted`/`onFocus`/`onBlur`. `Text({ markdown: true })` renders Markdown;
  `selectable`, `elide`, `maxLines` and `align` control plain text.
- `Tabs({ items, index })` is a tab strip; `Segmented` is the compact
  alternative. `Pager({ index, interactive })` swipes between children and
  reports `onPageChange`.
- `Sheet({ placement: "bottom" })` slides from the bottom; set `handle: true` to show
  a drag handle. `Popover` anchors a floating panel at `x`/`y`;
  `Snackbar({ open, text, actionLabel })` is a transient bar with an optional
  action.
- Every node accepts `tooltip`, `a11yLabel` and `a11yHint`; buttons, cards, images
  and chips also take `onLongPress`.
- `VirtualList({ items })` virtualises long lists and supports `selectable`,
  `reorderable`, `refreshable`, sticky sections and swipe actions; `Zoomable`
  adds pinch zoom around its child.
- Responsive layouts use `createBreakpoints(app)`:
  `const bp = createBreakpoints(app)`, then read `bp.current()` / `bp.atLeast("medium")`
  and pick `NavigationRail` or `NavBar`. `NavigationRail` accepts a `padding`
  gutter. The state is also published to `Store.breakpoint`, and window sizes
  (including Android rotation and split screen) arrive as `window-resize` events.
- `neon` works on any component: `Card({ neon: { color: "cyan", intensity: 1.2 } })`
  or `Text({ neon: true })`. It wraps the node in a padded colored glow drawn
  with `MultiEffect`: `color` (defaults to the theme primary), `intensity`,
  `glow` (strength), `padding` (room for the halo) and `effects` (set `false`
  for a plain outline instead of the glow). Content stays crisp. Under software
  rendering the GPU glow is replaced by the outline automatically.
- `Qml({ source: "ui/widget.qml", props, onEvent })` embeds an app QML
  component inside the JS tree. The loaded item calls `pulsarEmit(name, value)`
  to reach `onEvent`; `props` are applied on load and on every render.
- `onLayout({ width, height })` reports measured size, `onScroll({ offset,
  contentHeight, height })` works on `Page`, `Scroll` and `For`, and every node
  accepts `onFocus`/`onBlur`.
- `a11yRole` and `a11yChecked` add screen-reader roles and state; `a11yLabel`
  and `a11yHint` still set the accessible name and description.
- `component()` re-renders only when a signal, store key or prop it read changes.
  See the [components guide](docs/guide-components.md).
- `justify`, `alignItems`, `flex`, `paddingX`, `paddingY`, per-side padding, min and
  max sizes, `clip`, `zIndex` and `absolute` lay out any node; `Row`, `Column`,
  `Wrap` and `Stack` accept the surface props of `Box`. See the
  [guide for web developers](docs/guide-web.md).
- `Wave`, `Lightning` and `Aurora` are ready GPU effects, and `Shader({ source })` runs your
  own `.frag` file with helpers such as `wave`, `noise` and `glow`.
- `Orbit` and `Arrange` move real nodes in the renderer, so rings and carousels keep
  their clicks and text without traffic over the bridge.
- `Canvas({ draw, params, animated })` draws custom graphics in the renderer. See the
  [UI guide](docs/guide-ui.md).
- `hover`, `pressed` and `disabled` restyle a node, and `enter`, `exit`, `transition`
  and `drag` animate in the renderer.
- `KeepAlive({ active }, () => Screen({}))` builds a screen on first use and keeps it
  while hidden, with paused rendering. See the
  [components guide](docs/guide-components.md).
- Screens can be written in `.tsx` with `jsxImportSource: "pulsar"`. See the
  [guide for web developers](docs/guide-web.md).
- Scrolling follows the Android fling curve on every platform.
- A layout with spare space keeps its children at the start, and a window has no margin
  of its own.
- `Page` and `Scroll` accept `flick` and `overscroll` to turn off kinetic scrolling
  or the stretch at the bottom edge per screen.
- QML windows keep working as before — mix freely (some windows in QML, some in
  TypeScript).

## QML API (escape hatch)

QML is optional. Advanced users can set `"ui": "ui/main.qml"` on a window and
use the full QML API below; the same `Store` and capabilities are available.

```qml
import Pulsar 1.0   // Pulsar singleton + Store
```

### `Pulsar`

| Method                                                                                                         | Description                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Pulsar.emit(name, params)`                                                                                    | Fire an event to the app (`app.on(name, ...)`).                                                           |
| `Pulsar.call(name, params)`                                                                                    | Invoke an event/capability; returns a Promise (e.g. `Pulsar.call("fs.exists", { path: "." }).then(...)`). |
| `Pulsar.openFile(title, filter, dir)`                                                                          | Native open dialog; returns the path (synchronous).                                                       |
| `Pulsar.saveFile(title, filter, dir)`                                                                          | Native save dialog; returns the path.                                                                     |
| `Pulsar.message(title, text)`                                                                                  | Native message box.                                                                                       |
| `Pulsar.clipboardText()` / `Pulsar.clipboardWrite(text)`                                                       | Clipboard.                                                                                                |
| `Pulsar.trayAvailable()`                                                                                       | Whether a system tray is available.                                                                       |
| `Pulsar.setTrayIcon(path)` / `Pulsar.setTrayTooltip(text)` / `Pulsar.setTrayMenu(items)` / `Pulsar.hideTray()` | Tray control.                                                                                             |
| `Pulsar.diagnostics()`                                                                                         | Debug string.                                                                                             |
| `Pulsar.restart()`                                                                                             | Restart the backend (dev).                                                                                |
| `Pulsar.colorScheme`                                                                                           | `"light"` / `"dark"` (reactive; `colorSchemeChanged`).                                                    |

Signals: `log(level, message, source)`, `appEvent(event, payload, target)` and
`colorSchemeChanged` — subscribe with `Connections`. Each window also gets a
`PulsarWindowLabel` context property with its own label.

### `Store`

`Store.<key>` mirrors every `app.store` value reactively:

```qml
Label { text: "Count: " + (Store.count ?? 0) }
Grid { model: Store.photos; delegate: Image { required property var modelData; source: modelData.url } }
```

### Multi-window

```ts
// main.ts
app.on("togglePanel", async () => {
  const open = app.store.get("panelOpen") as boolean
  const panel = app.window("panel")
  await (open ? panel.hide() : panel.show())
  app.store.set("panelOpen", !open)
})
```

```qml
// panel.qml
Button {
    text: "Close me"
    onClicked: Pulsar.call("window", { label: "panel", action: "close" })
}
```

## Templates

`pulsar create <name> --template <t>`:

- **`default`** — a TypeScript UI with functional components, bindings, a keyed
  list, a composer modal and an empty state. No QML files.
- **`js`** — alias for `default`.
- **`qml`** — the classic QML window; use it when you want raw QML (advanced).
- **`windows`** — two windows sharing one `Store`, `app.window(label)` control,
  lifecycle events, a tray icon and native dialogs (QML).
- **`tray`** — a window plus a system-tray menu (QML).

See [`examples/hello`](examples/hello) and [`examples/windows`](examples/windows)
for complete apps.

## Building from source

Requirements: Bun, CMake (≥ 3.21), a C++20 compiler, and Qt 6.9+ development
files including the WebSockets module.

```sh
# Debian/Ubuntu
sudo apt install g++ cmake qt6-base-dev qt6-base-dev-tools qt6-declarative-dev \
  qt6-websockets-dev qml6-module-qtquick qml6-module-qtquick-controls

# Fedora
sudo dnf install gcc-c++ cmake qt6-qtbase-devel qt6-declarative-devel qt6-qtwebsockets-devel

# Arch
sudo pacman -S base-devel cmake qt6-base qt6-declarative qt6-websockets qt6-quickcontrols2

# macOS
brew install cmake qt

# Windows: install Qt 6.9 via the online installer, then pass -DCMAKE_PREFIX_PATH=<qt>/lib/cmake
```

Then:

```sh
bun install
cmake -S . -B build && cmake --build build
```

The build produces:

- `build/bin/qml-host` — the Qt host (renders QML, runs native dialogs/tray);
- `build/bin/bridge` — the C++ process supervisor for the runtime;
- `build/bin/launcher` — the Qt-free single-file launcher.

The CLI takes its sources from the directory it runs from. When the installed
`pulsar` launcher is on `PATH`, point `PULSAR_SOURCE` at a checkout to build
apps — desktop and Android APKs — against that checkout's host and SDK:

```sh
PULSAR_SOURCE=/path/to/pulsar pulsar build --target android
```

Qt is located with CMake's `find_package(Qt6)`, so pass `-DCMAKE_PREFIX_PATH=<qt>`
if it is not in a standard location. `PULSAR_QMAKE` still selects the `qmake`
used when packaging (`pulsar build` bundles Qt).

Releases are produced by a CI matrix (`.github/workflows/release.yml`) that
builds on Linux, macOS and Windows and packages Qt per platform (`ldd` on Linux,
`otool` + framework copy on macOS, `windeployqt` on Windows).

### Single-file layout

`pulsar build` appends a payload to `launcher`:

```
[ launcher ][ payload container ][ payload offset + magic ]
             ├─ bin/qml-host, bin/bridge, bin/qt.conf
             ├─ runtime                  (Bun standalone: runtime + app + SDK)
             ├─ app/…                     (QML, assets, manifest)
             └─ lib/Qt/…                  (bundled Qt, Linux/macOS)
                                          or Qt DLLs beside the host on Windows
```

At startup the launcher extracts the payload into the user cache and execs the
host, which loads its own Qt — from `lib/Qt` via RPATH on Linux/macOS, or from
the DLLs next to the executable on Windows — never from the system. Use
`--slim` to omit Qt and rely on the system installation.

`pulsar build` reuses the Qt that ships with the installed toolchain; when the
host has no bundled Qt (dev builds) it falls back to `qmake`. Set
`PULSAR_QT_ROOT` to point at a specific Qt tree.

## Platform parity

The same UI tree should look the same on desktop and Android, so the renderer pins what affects layout:

- icons always come from the bundled Material Icons font; `theme.iconFamily` overrides it deliberately;
- the Qt Quick Controls style is `Basic` everywhere; `PULSAR_CONTROLS_STYLE` overrides it for experiments;
- the host never substitutes fonts: bundle the UI font you use;
- desktop builds should use the same Qt version as the Android bundle (6.9.x) when pixel parity matters;
- build host, SDK and app from one revision (`PULSAR_SOURCE`), otherwise stale artifacts diverge.

`pulsar dev` warns when the installed toolchain and CLI versions differ, and `pulsar doctor` reports the host and Qt details. Runtime and QML errors are appended to `crash.log` in the app data directory.

## Release signing

`pulsar build --target android` signs `dist/<name>.apk` with the debug keystore by default. Add `--aab` to also build and sign `dist/<name>.aab` for the Play Store. For a release key set `PULSAR_ANDROID_KEYSTORE`, `PULSAR_ANDROID_KEYSTORE_PASS`, `PULSAR_ANDROID_KEY_ALIAS` and, when it differs, `PULSAR_ANDROID_KEY_PASS`. Bump `version` in `pulsar.json` first.

Set `PULSAR_CRASH_URL` to an HTTP endpoint to POST a JSON crash report (`app`, `platform`, `qt`, `error`) whenever an app or runtime error is logged; without it reports stay in the local `crash.log`.

## Protocol

The host and the runtime exchange framed messages over stdio: JSON-RPC on the
control channel and a binary data channel for bulk payloads. The runtime
announces itself with an `__hello` handshake (protocol version, runtime,
capabilities) and talks through a `Transport` abstraction. See
[`docs/protocol.md`](docs/protocol.md).

## Repository layout

```
cli/        CLI (create/install/update/doctor), project templates, Android build
core/       runtime + SDK
  caps/     built-in capabilities (fs, net, paths, shell, storage)
  runtime/  the Bun runtime that talks to the host
  sdk/      the `pulsar` package apps import
host/       C++/Qt host: QML engine, dialogs, tray, window management
  qml/      Pulsar QML module and the JS-built UI view
bridge/     C++ supervisor (runs Bun, reports crashes, proxies stdio)
launcher/   Qt-free C++ launcher for single-file apps
examples/   example apps
tests/      fixtures used by the smoke test
scripts/    build, smoke, formatting, release and Android Qt packaging helpers
install.sh, install.ps1   bootstrap installers
```

## Testing

```sh
bun run test        # unit tests + headless smoke test
bun run typecheck
bun run fmt:check
```

## License

MIT — see [`LICENSE`](LICENSE). Pulsar links Qt (LGPL-3.0) dynamically; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Apps built with `--slim`
require the user's own Qt installation.
