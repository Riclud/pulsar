<p align="center">
  <strong>English</strong> ·
  <a href="docs/README.ru.md">Русский</a>
</p>

# Pulsar

A desktop app framework — like Electron, but built on **QML** for the UI and
**Bun** for the backend, shipped as a single self-contained executable.

- **UI**: QML (native GPU rendering, low memory — no Chromium).
- **Backend**: TypeScript running on [Bun](https://bun.sh).
- **Bridge**: a capability layer between QML and the backend, plus a small
  Qt host and a Zig process supervisor.
- **Packaging**: `pulsar build` produces one file with the Bun runtime (and,
  by default, the Qt runtime) bundled in.

## Requirements

- **[Bun](https://bun.sh) ≥ 1.2** — the CLI and every app run on Bun.
- **Qt 6.8+** — only if you build the host from source or use the `--slim`
  toolchain (`pulsar build --slim` / `pulsar install --slim`). The default
  toolchain and builds bundle Qt, so end users need nothing extra.

## Install

### From a release (recommended)

> **Release assets are currently built for Linux x64 only.** macOS and Windows
> are in progress — use the [from-source](#from-source) path there. The
> bootstrap scripts already detect those platforms and will start working as
> soon as their assets are published.

Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/riclud/pulsar/main/install.sh | sh
pulsar install          # downloads the native toolchain (host + bridge + Qt)
```

macOS / Windows (once assets are published):

```sh
curl -fsSL https://raw.githubusercontent.com/riclud/pulsar/main/install.sh | sh
pulsar install
```

```powershell
iwr https://raw.githubusercontent.com/riclud/pulsar/main/install.ps1 -UseBasicParsing | iex
pulsar install
```

The bootstrap installs the CLI to `~/.local/share/pulsar` (or
`%LOCALAPPDATA%\pulsar` on Windows) and a `pulsar` shim on your `PATH`.
`pulsar install` then fetches the platform toolchain:

- default: **fat** — bundles Qt, zero configuration;
- `--slim` — no Qt, uses the system one.

### From source

```sh
git clone https://github.com/riclud/pulsar
cd pulsar
bun install
zig build                 # builds qml-host, bridge and launcher into zig-out/
bun cli/index.ts doctor   # verify
```

Requires a Qt 6 development installation (`qmake`/`pkg-config`). See
"Building from source" below.

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
  install        download the native toolchain for this platform
  update         update the CLI to the latest release
  dev            run with hot reload (watch sources)
  run            run the app in the current directory
  build          build a single-file executable
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
  "protocols": [{ "scheme": "myapp" }],
  "singleInstance": true
}
```

| Field            | Meaning                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | Reverse-DNS id; used for per-app data/config/cache directories.                                                                                 |
| `name`           | Display/output name (also the `dist/<name>` file name).                                                                                         |
| `version`        | App version.                                                                                                                                    |
| `main`           | Backend entry point relative to the manifest (default `main.ts`).                                                                               |
| `icons`          | Per-platform icon paths (used by packaging).                                                                                                    |
| `windows[]`      | Initial windows: `label`, `ui`, `width`, `height`, `title`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `resizable`, `frameless`, `icon`. |
| `permissions`    | Reserved (not enforced yet).                                                                                                                    |
| `protocols`      | Reserved: custom URL schemes.                                                                                                                   |
| `singleInstance` | Reserved: single-instance behavior.                                                                                                             |

`App` derives its config from the first manifest window; explicit options
passed to `new App({...})` override the manifest.

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
  dialog,
  tray,
  callCapability,
  registerCapability,
} from "pulsar"
```

### App

| Member               | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `new App(config?)`   | Create the app. Config comes from `pulsar.json`; `config` overrides it. |
| `app.store`          | Reactive state shared with all windows (see `Store`).                   |
| `app.on(event, fn)`  | Subscribe to an event emitted from QML (`Pulsar.emit`) or the host.     |
| `app.window(label?)` | Get a `WindowHandle` (defaults to the first window).                    |
| `app.windows`        | All declared windows.                                                   |
| `app.config`         | The first window's config.                                              |
| `app.manifest`       | The parsed `pulsar.json` (or `null`).                                   |
| `app.quit()`         | Quit the application.                                                   |
| `app.run()`          | No-op marker; the host owns the event loop.                             |

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
```

Each method returns a `Promise<boolean>`.

### Lifecycle events

```ts
app.on("window-close", (params: { label?: string }) => console.log("closed", params.label))
app.on("window-all-closed", () => app.quit())
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
import { fs, paths, net, shell, storage } from "pulsar"

const text = await fs.readFile("notes.txt")
await fs.writeFile("notes.txt", "hello")
const entries = await fs.listDir(".")
const exists = await fs.exists("notes.txt")

const dirs = await paths.get() // { data, config, cache, temp, home }

const res = await net.fetch("https://example.com") // { status, url, text }

await shell.open("https://github.com/riclud/pulsar")
await shell.notify("Pulsar", "Build finished")

await storage.set("todos", [{ id: 1, text: "write docs" }])
const todos = await storage.get("todos")
await storage.remove("todos")
```

Storage persists JSON-safe values to `storage.json` in the per-app data
directory. `paths` returns the standard per-OS directories:

| OS      | data/config                                    | cache                       |
| ------- | ---------------------------------------------- | --------------------------- |
| Linux   | `$XDG_DATA_HOME/<id>`, `$XDG_CONFIG_HOME/<id>` | `$XDG_CACHE_HOME/<id>`      |
| macOS   | `~/Library/Application Support/<id>`           | `~/Library/Caches/<id>`     |
| Windows | `%APPDATA%\<id>`                               | `%LOCALAPPDATA%\<id>\cache` |

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

Signal `log(level, message, source)` — subscribe with `Connections`.

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

Requirements: Bun, Zig 0.16, and Qt 6.8+ development files.

```sh
# Debian/Ubuntu
sudo apt install qt6-base-dev qt6-base-dev-tools qt6-declarative-dev \
  qml6-module-qtquick qml6-module-qtquick-controls

# Fedora
sudo dnf install qt6-qtbase-devel qt6-qtdeclarative-devel

# Arch
sudo pacman -S qt6-base qt6-declarative qt6-quickcontrols2

# macOS
brew install qt
```

Then:

```sh
bun install
zig build
```

`zig build` produces:

- `zig-out/bin/qml-host` — the Qt host (renders QML, runs native dialogs/tray);
- `zig-out/bin/bridge` — the Zig process supervisor for the Bun runtime;
- `zig-out/bin/launcher` — the Qt-free single-file launcher.

Environment overrides: `PULSAR_QT` (Qt root), `PULSAR_QMAKE` (`qmake` binary),
`PULSAR_NO_PKGCONFIG`.

### Single-file layout

`pulsar build` appends a payload to `launcher`:

```
[ launcher ][ payload container ][ payload offset + magic ]
             ├─ bin/qml-host, bin/bridge, bin/qt.conf
             ├─ runtime                  (Bun standalone: runtime + app + SDK)
             ├─ app/…                     (QML, assets, manifest)
             └─ lib/Qt/…                  (bundled Qt libs, plugins, QML modules)
```

At startup the launcher extracts the payload into the user cache and execs the
host, which loads Qt from `lib/Qt` via its RPATH — never from the system. Use
`--slim` to omit Qt and rely on the system installation.

## Repository layout

```
cli/        CLI (create/install/update/doctor), project templates
core/       runtime + SDK
  caps/     built-in capabilities (fs, net, paths, shell, storage)
  runtime/  the Bun runtime that talks to the host
  sdk/      the `pulsar` package apps import
host/       C++/Qt host: QML engine, dialogs, tray, window management
bridge/     Zig supervisor (runs Bun, reports crashes, proxies stdio)
launcher/   Zig-free C++ launcher for single-file apps
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
