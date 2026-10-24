<p align="center">
  <strong>English</strong> ·
  <a href="docs/README.ru.md">Русский</a>
</p>

# Pulsar

A desktop app framework built on **QML** for the UI and **Bun** for the backend,
shipped as a single self-contained executable.

- **UI**: QML (native GPU rendering, low memory — no Chromium).
- **Backend**: TypeScript running on [Bun](https://bun.sh).
- **Bridge**: a capability layer between QML and the backend, plus a small
  Qt host and a C++ process supervisor.
- **Packaging**: `pulsar build` produces one file with the Bun runtime (and,
  by default, the Qt runtime) bundled in.

## Requirements

- **[Bun](https://bun.sh) ≥ 1.2** — the CLI and every app run on Bun.
- **Qt 6.8+** (Qt **6.9.2+** on macOS — older 6.8.x links the removed AGL
  framework) — only if you build the host from source or use the `--slim`
  toolchain (`pulsar build --slim` / `pulsar install --slim`). The default
  toolchain and builds bundle Qt, so end users need nothing extra; its platform
  dependencies (X11/Wayland, fonts, GPU drivers) still come from the system.

## Install

### From a release (recommended)

Prebuilt assets are published for **linux-x64**, **macos-arm64** and
**windows-x64**.

Linux / macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/riclud/pulsar/main/install.sh | sh
pulsar install          # downloads the native toolchain (host + bridge + Qt)
```

Windows:

```powershell
iwr https://raw.githubusercontent.com/riclud/pulsar/main/install.ps1 -UseBasicParsing | iex
pulsar install
```

> macOS assets are arm64-only for now; on an Intel Mac use the
> [from-source](#from-source) path.

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
pulsar create my-app      # scaffold (templates: default, windows, tray)
cd my-app
pulsar dev                # run with hot reload
```

`my-app` looks like this:

```
my-app/
  pulsar.json     # app manifest: id, windows, entry point
  main.ts         # backend (Bun) — App, state, events
  ui/main.qml     # UI (QML)
  assets/icon.png
  package.json
  tsconfig.json
```

`main.ts`:

```ts
import { App } from "pulsar"

const app = new App()

app.store.set("greeting", "Hello from Pulsar")

app.on("greet", (params: { name: string }) => {
  app.store.set("greeting", `Hello, ${params.name}!`)
})

app.run()
```

`ui/main.qml`:

```qml
import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true

    Column {
        anchors.centerIn: parent
        spacing: 12

        Label { text: Store.greeting || "" }

        Button {
            text: "Greet"
            onClicked: Pulsar.emit("greet", { name: "World" })
        }
    }
}
```

`pulsar.json` supplies the window defaults, so `new App()` needs no arguments.

## CLI

```
pulsar <command>

  create <name>  scaffold a new app (--template default|windows|tray)
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
| `install`       | `--version <v>\|latest`, `--slim`                          |
| `build`         | `--out <dir>` / `-o <dir>`, `--slim`                       |
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

`net.fetch` and streaming `net.request` work on Android: HTTP runs in the native
host through QtNetwork, so text and binary chunks arrive without any JS-side
networking code.

## The manifest — `pulsar.json`

One file drives the app config and packaging.

```json
{
  "id": "com.example.myapp",
  "name": "my-app",
  "version": "0.1.0",
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
      "icon": "assets/icon.png"
    }
  ],
  "permissions": [],
  "fileAssociations": [{ "ext": "md", "mime": "text/markdown", "name": "Markdown document" }],
  "protocols": [{ "scheme": "myapp" }],
  "singleInstance": true
}
```

| Field              | Meaning                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Reverse-DNS id; used for per-app data/config/cache directories.                                                                                 |
| `name`             | Display/output name (also the `dist/<name>` file name).                                                                                         |
| `version`          | App version.                                                                                                                                    |
| `main`             | Backend entry point relative to the manifest (default `main.ts`).                                                                               |
| `icons`            | Per-platform icon paths (used by packaging).                                                                                                    |
| `windows[]`        | Initial windows: `label`, `ui`, `width`, `height`, `title`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `resizable`, `frameless`, `icon`. |
| `permissions`      | Capabilities the app may use (see [Permissions](#permissions)). Absent = all.                                                                   |
| `protocols`        | Custom URL schemes (deep links) the app handles.                                                                                                |
| `fileAssociations` | File types the app opens: `ext` (without the dot), `mime`, `name`.                                                                              |
| `singleInstance`   | Forward a second launch to the running instance and exit (default `false`).                                                                     |

`App` derives its config from the first manifest window; explicit options
passed to `new App({...})` override the manifest.

### Permissions

`permissions` declares the OS-facing capabilities the app may use. When the
field is **absent** every capability is allowed; when **present** only the
listed ones are, and any other capability call fails with a `permission denied`
error.

```json
{ "permissions": ["fs", "net", "dialog"] }
```

| Permission | Grants                                       |
| ---------- | -------------------------------------------- |
| `fs`       | filesystem reads/writes, stat, rename, trash |
| `net`      | `net.fetch`                                  |
| `paths`    | standard per-app directories                 |
| `shell`    | open URLs in the default application         |
| `notify`   | native notifications                         |
| `dialog`   | native file/message dialogs                  |
| `screen`   | monitor list                                 |
| `theme`    | system color scheme                          |
| `system`   | locale/language/timezone                     |
| `storage`  | the app's JSON storage file                  |
| `secure`   | OS keychain / secret storage                 |
| `tray`     | system tray icon and menu                    |

Window management is core and is not gated. Custom capabilities registered by
the app are never gated either.

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
`body` (string or `Uint8Array`), `timeoutMs`, `redirect` (`follow` / `manual` /
`error`), `maxRedirects`, `responseType` (`text` / `binary` / `auto`) and
`tlsFingerprint`. `tlsFingerprint: true` (or a profile such as `"chrome120"`)
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

Native dialogs live in `dialog`:

```ts
import { dialog } from "pulsar"

const one = await dialog.openFile({ title: "Open", filter: "Images (*.png *.jpg);;All files (*)" })
const many = await dialog.openFiles({ title: "Open several" })
const dir = await dialog.openDirectory({ title: "Choose a folder" })
const saveTo = await dialog.saveFile({ title: "Save as" })
await dialog.message({ title: "Pulsar", text: "Done!" })
```

### Notifications, screens, theme, locale

```ts
import { notify, screen, system, theme } from "pulsar"

const token = await notify.show({ title: "Pulsar", body: "Build finished" })
app.on("notification-click", (data) => {
  if (data.token === token) app.window().focus()
})

const screens = await screen.list() // [{ name, x, y, width, height, workArea, scale, primary }]
const mainScreen = await screen.primary()

const { scheme } = await theme.current() // "light" | "dark"
app.on("theme-changed", (data) => console.log("now", data.scheme))

const { locale, language, timezone } = await system.locale()
```

Storage persists JSON-safe values to `storage.json` in the per-app data
directory. `paths` returns the standard per-OS directories:

| OS      | data/config                                    | cache                       |
| ------- | ---------------------------------------------- | --------------------------- |
| Linux   | `$XDG_DATA_HOME/<id>`, `$XDG_CONFIG_HOME/<id>` | `$XDG_CACHE_HOME/<id>`      |
| macOS   | `~/Library/Application Support/<id>`           | `~/Library/Caches/<id>`     |
| Windows | `%APPDATA%\<id>`                               | `%LOCALAPPDATA%\<id>\cache` |

### Secrets (OS keychain)

`secureStorage` keeps strings in the OS secret store: Keychain on macOS, DPAPI
on Windows and libsecret (`secret-tool`) on Linux. Entries are scoped to the
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

## UI from JS

You don't have to write QML: a window declared **without `ui`** is rendered from
a JS tree built with the `ui` helpers.

```ts
import { App, ui } from "pulsar"

const app = new App()

app
  .window("main")
  .render(() =>
    ui.column({ gap: 8, padding: 12 }, [
      ui.text({ text: "Count: " + (app.store.get("count") ?? 0) }),
      ui.button("+1", { onClick: () => app.store.set("count", (app.store.get("count") as number) + 1) }),
      ui.checkbox("Enabled", { onToggle: (v) => app.store.set("enabled", v) }),
      ui.textInput({ placeholder: "Name", onInput: (v) => app.store.set("name", v) }),
    ]),
  )

app.run()
```

`render` takes a tree or a function; the function is called again whenever
`Store` changes, so the UI stays in sync. Components: `column`, `row`, `box`,
`text`, `button`, `textInput`, `checkbox`, `switch`, `slider`, `image`, `spacer`,
`divider`. QML windows keep working as before — mix freely (some windows in QML,
some in JS).

## QML API

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

- **`default`** — one window, a `Store`, one event.
- **`windows`** — two windows sharing one `Store`, `app.window(label)` control,
  lifecycle events, a tray icon and native dialogs.
- **`tray`** — a window plus a system-tray menu.

See [`examples/hello`](examples/hello) and [`examples/windows`](examples/windows)
for complete apps.

## Building from source

Requirements: Bun, CMake (≥ 3.21), a C++20 compiler, and Qt 6.9+ development
files.

```sh
# Debian/Ubuntu
sudo apt install g++ cmake qt6-base-dev qt6-base-dev-tools qt6-declarative-dev \
  qml6-module-qtquick qml6-module-qtquick-controls

# Fedora
sudo dnf install gcc-c++ cmake qt6-qtbase-devel qt6-qtdeclarative-devel

# Arch
sudo pacman -S base-devel cmake qt6-base qt6-declarative qt6-quickcontrols2

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

## Protocol

The host and the runtime exchange framed messages over stdio: JSON-RPC on the
control channel and a binary data channel for bulk payloads. The runtime
announces itself with an `__hello` handshake (protocol version, runtime,
capabilities) and talks through a `Transport` abstraction. See
[`docs/protocol.md`](docs/protocol.md).

## Repository layout

```
cli/        CLI (create/install/update/doctor), project templates
core/       runtime + SDK
  caps/     built-in capabilities (fs, net, paths, shell, storage)
  runtime/  the Bun runtime that talks to the host
  sdk/      the `pulsar` package apps import
host/       C++/Qt host: QML engine, dialogs, tray, window management
bridge/     C++ supervisor (runs Bun, reports crashes, proxies stdio)
launcher/   Qt-free C++ launcher for single-file apps
examples/   example apps
tests/      fixtures used by the smoke test
scripts/    build/smoke/format/release helpers
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
