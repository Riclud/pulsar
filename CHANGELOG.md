# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `net.websocket(url, options?)` for `ws://` and `wss://` connections: `open`,
  `message`, `close` and `error` events, text and binary messages, subprotocols,
  custom headers and a connect timeout. It runs in the native host on Qt
  WebSockets and needs the `net` permission.
- Qt WebSockets is now a build dependency; release toolchains and Android Qt
  bundles ship it.
- JS UI kit for QML-free apps: `card`, `appBar`, `list`, `scroll`, `icon`,
  `iconButton`, `chip`, `sheet`, `progress` and `select`, a light/dark theme and
  the Material Icons font. Re-renders now reconcile existing QML objects
  instead of rebuilding the tree, preserving focus and scroll.
- QML-like TypeScript components: `bind`, `For`, `When`, `defineComponent` and
  web-named components (`Column`, `Row`, `Card`, `Header`, `Input`, `Checkbox`,
  `Modal`, ...). Children are variadic; the existing `ui.*` factories stay
  compatible.
- `pulsar create` now scaffolds the TypeScript template by default. The QML
  starter moved to `--template qml`; `--template js` is an alias for the
  default.

### Changed

- `For` / `List` render a scrollable column instead of a `ListView` for now, so
  rows keep correct hit areas on Android. Row paths stay keyed; virtualization
  returns later.

### Fixed

- TypeScript UI windows now render on Android: the embedded host bundles
  `PulsarView`, applies `__ui` trees to the window and exposes the bridge as a
  context property.
- Android text input and checkbox taps now reach the app store (`textChanged`
  plus a tap overlay), so typing, toggling and adding tasks work on device.
- `Store.set` stores the new value before notifying listeners, so a UI render
  triggered by a change sees the updated state instead of the previous one.
- Checkboxes and switches no longer emit `toggle` when their checked state is
  set programmatically, which could otherwise loop through the app store.

## [1.0.1] - 2026-10-31

### Added

- `pulsar doctor` warns when the active toolchain version differs from the CLI
  version, with the command that fixes it.

### Docs

- README (English and Russian) now covers `fs.open`, `fs.exportTo` and
  `dialog.toast`, including where exported files land on desktop and Android.

### Tests

- Unit tests for `fs.open`, `fs.exportTo`, `dialog.toast` and the
  `__export-result` reply, using a mock transport.

## [1.0.0] - 2026-10-31

First stable release. The documented API is considered stable; the gaps listed
below are planned for 1.1.

### Platforms

- Linux x64 and ARM64, macOS Intel and Apple Silicon, Windows x64 and ARM64
  ship a CLI, a fat toolchain with bundled Qt, and a slim toolchain without it.
- Android arm64-v8a builds a signed APK (minSdk 28, targetSdk 35).
- Linux ARM64 and Windows ARM64 are built and packaged in CI but have not been
  run on real hardware yet. iOS is not supported.

### Added

- Single-file desktop apps: a Qt-free launcher embeds the runtime and the Qt
  host into one executable.
- UI from JavaScript: `ui.column/row/box/text/button/...` renders a window
  without QML, re-rendering when the `Store` changes.
- Embedded QuickJS harness on the desktop (`qml-host-qjs`).
- Network in the native host: `net.fetch` and streaming `net.request` with
  timeout, redirects and abort.
- OS integration: single instance with `second-instance`, deep links and open
  files (`open-url`, `open-file`), file associations, recent documents, secure
  storage backed by the OS keychain, and manifest permissions enforced on every
  capability.
- System surface: notifications, screens, theme, locale, tray, dialogs and the
  full `fs` capability set.
- Android: in-process QuickJS and QML, lifecycle events (`app-pause`,
  `app-resume`, `app-stop`, `back-pressed`), native HTTP with binary streaming,
  and `pulsar install --android` to provision JDK, SDK, NDK and Qt.
- Attachments: the multi-file SAF picker and `fs.exportTo` to the device
  Downloads on Android, `fs.open` and `dialog.toast` on both platforms, and
  `fs.exportTo`/`fs.open` on the desktop.
- Portable runtime target with an import audit (`pulsar check --target
android|portable`).

### Fixed

- Android: the keyboard now opens on the first tap on Samsung and Android 16;
  the packaged Qt bundle carries the patched input delegate.

### Known gaps

- No WebSocket in `net`.
- The JS-rendered UI rebuilds the whole tree on every change.
- Installed apps do not update themselves; `pulsar update` only updates the CLI.
- Notification action buttons, a desktop power monitor and a native macOS menu
  bar are not implemented.
- Android x86_64 (emulators) is not packaged.

## [0.2.0] - 2026-10-24

### Added

- Android support: `pulsar build --target android`, the APK toolchain bootstrap
  and the published Qt for Android bundles for Linux and macOS hosts.
- An engine-neutral core with the `portable` target.
- Published Qt for Android bundle made relocatable and self-contained.

## [0.1.3] - 2026-10-15

### Added

- Releases for Linux, macOS and Windows with per-platform Qt packaging.
- Bootstrap installers for shell and PowerShell.

## [0.1.0] - 2026-10-14

First public builds: Linux release, self-contained Qt runtime and the
single-file layout.
