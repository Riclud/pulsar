# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `pulsar dev` on the desktop answers the device commands too: `ui`, `state`, `tap`, `type`,
  `key`, `eval`, `shot` and the new `hover`, `scroll` and `keys`. Taps, hovers, wheel turns
  and keys reach the window as real input, so hover and press states behave as with a mouse.
- Device commands find icon buttons by their `a11yLabel`.
- `pulsar mcp`: a Model Context Protocol server, so AI agents can start an app offscreen,
  read its UI tree and screenshots, click, type and read logs while they edit it.
- `dialog.toast` shows a toast on the desktop too, at the bottom of the window.

## [2.1.0] - 2026-11-07

### Added

- Release assets `pulsar-<platform>.tar.gz` (and `.zip` on Windows) hold the CLI and the
  toolchain together, for system package managers. `packaging/` has the AUR, Homebrew,
  Scoop and winget files, and `bun scripts/packaging.ts <version>` fills them in.
- The CLI finds a toolchain shipped beside it, so packages need no `pulsar install`.
- `crypto.randomBytes` and `crypto.pbkdf2` give native random bytes and PBKDF2-SHA256,
  so QuickJS apps can derive keys from a password without a multi-second pause.
- `biometric.seal` and `biometric.open` keep a secret behind the fingerprint on Android,
  in a Keystore key that a new enrolled fingerprint invalidates.

### Fixed

- `system.locale` reports the OS language. QuickJS has no `Intl` and Bun's ignores `LANG`,
  so apps on a Russian phone or desktop started in English.
- A `TextArea` with `lines` grows with its text and keeps the cursor in view instead of
  letting long text run under the controls below.
- `fs.exportTo` on Android 10 and later keeps the file's original modification time
  in Downloads instead of the time it was written.
- Wheel and touchpad scrolling follow a target every frame, so the speed no longer
  jumps between wheel steps or with the touchpad's event rate.
- Buttons kept working only until a parent component rerendered around them; their
  click handlers are no longer dropped.
- `Segmented` and `Tabs` report a change only when pressed, not while they are built,
  and events raised while a tree is being built wait until it is done.
- Text fields use the theme's body size and have more room, so they match nearby text.

## [2.0.0] - 2026-11-06

### Breaking

- Desktop apps run on QuickJS unless their code imports Node or Bun APIs, in which
  case Bun is bundled as before. `pulsar dev`, `pulsar run` and `pulsar build` use the
  same engine. Set `"runtime": { "desktop": "bun" }` to keep Bun for every build.
- The `pulsar` CLI is one file with Bun inside. You no longer install Bun to use it.
- Entry suffixes split platform from engine: a desktop build on QuickJS looks for
  `main.desktop.ts`, then `main.quickjs.ts`, then `main.ts`.

- `bind`, `When`, `memo`, `defineComponent`, `AppBar` and `TextField` are gone. Read
  values directly while rendering, use a ternary, and use `component`, `Header` and
  `Input`.
- `List`, `Modal`, `BottomSheet` and the `ui` object with its lower-case factories are
  gone. Use `For`, `Sheet`, `Sheet({ placement: "bottom" })` and the capitalized
  components.
- `fillWidth` and `fillHeight` now always fill a `Row` or `Column`. They used to stop
  at the size of the children. A `Row` that relied on `align: "center"` to center its
  narrow self should use `justify: "center"`; use `alignItems` to center children.
- A `Row`, `Column` or `Box` with more space than its children need now packs them at
  the start, as flexbox does. They used to spread out, and a child of a tall `Box` sat
  in the middle. Use `Column({ justify: "center", alignItems: "center" })` to center.
- A window no longer has a margin around its content. Add `padding` to the root node.
- `flickVelocity` and `flickDeceleration` are gone. Scrolling now follows the Android
  fling curve, and `overscroll` stretches the content at the bottom edge and defaults
  to true.
- A window no longer re-renders on every store change. Values read during a render
  must come from a signal, `createState` or the store; `app.invalidateUi()` covers
  anything else.
- `store.set` compares objects by reference, so setting an equal copy is a change.

### Added

- `pulsar check` and `pulsar build` say which engine a build uses and why Bun is
  bundled when it is.
- `platform()` returns the OS, `desktop` or `mobile`, and the engine.
- Desktop builds are compressed with zstd and leave out what the app does not use: the
  shader compiler, unused Controls styles and, unless the app uses `media`, FFmpeg.
  `"video"` in `pulsar.json` overrides that.
- `pulsar dev` and `pulsar build` install missing packages with the project's own
  package manager, found from its lock file.

- `focusBorderColor` on `Input` and `TextArea`.

- `blur`, `glass`, `rotation` and `spinSpeed` on any node, and `from` and `to` on `Lightning`.
- `Orbit` and `Arrange` place real nodes from the renderer on every frame, and numbers in
  `params` glide to new values over `transition`.
- `Wave`, `Lightning` and `Aurora` are ready GPU effects. `Shader` runs an app's `.frag` file,
  written as one `effect` function with helpers such as `wave`, `noise` and `glow`. The CLI
  compiles it on run and build, and on save in `pulsar dev`.
- `Canvas` draws custom graphics. `draw` runs in the renderer, so an animation costs no
  bridge traffic, and it takes data through `params`.
- `KeepAlive` builds a screen on first use and keeps it while hidden, with paused
  rendering, so it reopens at once with its scroll and input intact. `preload` builds it
  ahead of time.
- JSX: write screens in `.tsx` with `jsxImportSource: "pulsar"`. Tags compile to the
  same component calls, and `.ts` and `.tsx` files import each other.
- `signal`, `computed`, `effect`, `untracked` and `createState`.
- `component()` with local state, `onMount` and `onCleanup`. Only components that
  read a changed value re-render.
- Layout props: `justify`, `alignItems`, `flex`, `paddingX`, `paddingY`, per-side
  padding, `minWidth`, `minHeight`, `maxHeight`, `clip`, `zIndex`, and `absolute`
  inside a `Stack`.
- `Row`, `Column`, `Wrap` and `Stack` accept the surface props of `Box`.
- Motion props: `enter`, `exit`, `transition` and `drag`.
- State styles: `hover`, `pressed` and `disabled` set `color`, `borderColor`,
  `opacity` and `scale`, and animate over `transition.duration`. `enabled` works on
  any node.
- `secureStorage` on Android, using the Keystore. `screen.list` and `theme.current`
  also work on Android.
- `storage.setMany`, `net.fetch` options `bodyFile` and `maxBytes`, and
  `app.onUiTimings`.
- `Qml({ source, props, onEvent })` embeds an app QML component inside the
  JS-built tree; the loaded item gets `pulsarEmit(name, value)` for events.
- `onLayout` reports the measured `{ width, height }` of any node.
- `Page`, `Scroll` and `For` accept `onScroll` with `{ offset, contentHeight,
  height }`.
- Every node accepts `onFocus`/`onBlur`, and `a11yRole`/`a11yChecked` map to Qt
  Accessible roles and state.
- `Page` and `Scroll` accept `flickVelocity`, `flickDeceleration` and
  `overscroll`.
- `PULSAR_DEBUG` and the inspector report created, updated, removed and
  reordered node counts for each build.
- `memo(Component)` reuses a keyed component node when its non-function props
  are unchanged.
- UI updates send `__ui-patch` with only changed subtrees; the full tree is
  kept for the first render and for root or type changes.

### Changed

- The mouse wheel adds up: fast notches speed a list up instead of bogging it down, and
  a touchpad follows the fingers.
- Linux uses the threaded render loop unless `QSG_RENDER_LOOP` is set, which paces
  animation far more evenly than the basic loop Qt picks on NVIDIA under Wayland.
- Creating nodes is much faster on a phone: QML snippets are compiled once instead of
  on every node.
- UI events carry the window label and node path; handlers are rebuilt per
  window instead of being dropped before each tree is applied.
- Keyed children are reconciled in place: insertions, removals and reordering
  move existing items instead of clearing the container.

### Fixed

- `gradient` on `Box` and `Card` now draws; it used to paint nothing.
- A tap reaches only the deepest clickable node, not every card around it.
- Cards that hide or appear close their gap with them, instead of jumping at the end.
- Sheets and nodes with `elevation` stay visible under software rendering, without the
  shadow. They used to disappear.
- `SearchField` reports text while a word is still being composed on the keyboard.
- A click finishes the word being composed on the keyboard first, so a button next to
  an input sees the whole text.
- A layout that updates while hidden keeps its padding.
- A `flex` child keeps its size when only that child updates.
- An input keeps focus when a sibling is inserted before it.
- A focused field scrolls into view smoothly when the keyboard opens.
- `flex` ignores children that are being removed.
- A `SearchField` with `debounce` no longer loses typing to a stale `value`.
- Code can change the value of a focused input, so clearing it after a submit works.
- A child with `elevation` no longer takes the end padding of its parent.
- Sheets and `Segmented` use the theme font.

- A timer callback that cleared its own timer crashed the embedded host.
- `Pulsar.call` never resolved in the embedded host.
- Reloading an embedded app left a blank screen.
- Unhandled rejections and top-level errors were silent in the embedded host.
- `dialog.message` was accepted automatically on Android without showing anything.
- `storage` could lose all data on a truncated file; writes are now atomic and a
  corrupted file is kept aside.
- `net.download` failed above 64 MB, and `timeoutMs` aborted transfers that were
  still receiving data.
- `fs.watch` callbacks never ran, and store changes were not pushed during a slow
  request.
- The runtime could miss its first message while starting, leaving a QML app without
  its state.
- A conditional child no longer moves the nodes after it, and shallow patches no
  longer carry the subtree.
- `pulsar tap` now routes by path and skips hidden nodes.
- Store values are logged only under `PULSAR_DEBUG`.

- Focus, text selection and scroll positions survive structural updates.
- The CLI bundles Qt libraries whose `ldd` paths go through
  `plugins/platforms/../../lib`, so `libQt6XcbQpa` no longer falls back to the
  system Qt and the xcb platform plugin starts.
- `For` and `Scroll` inside `Page` or another `Scroll` grow with their content instead
  of getting no height and showing nothing.
- JSX apps start from an installed CLI. The archive was missing the `tsconfig.json`
  that tells Bun to use `pulsar` for JSX, so they failed with `react/jsx-dev-runtime`.
- `pulsar dev` no longer crashes on an app with shaders when the Android toolchain is
  not installed.

### Dev

- `pulsar dev` keeps the window open and sized across a reload, instead of recreating
  it on every save.

### Platforms

- Experimental iOS simulator build: `pulsar build --target ios`.

## [1.4.0] - 2026-11-04

### Added

- `Page` and `Scroll` accept `flick: false`, which disables kinetic fling while
  keeping drag scrolling; useful for dense task lists that should stop as soon
  as the finger lifts.

### Changed

- Scroll views and virtual lists keep more of the fling velocity and decelerate
  more slowly (`maximumFlickVelocity` 5000, `flickDeceleration` 1200), so a
  sharp swipe keeps the list moving like a native chat list.

### Fixed

- Android and desktop builds from an installed release read `PULSAR_VERSION`
  from `cli/package.json` when the root manifest is missing, and the CLI archive
  now ships `package.json`. This unblocks `pulsar build --target android` on
  installed toolchains.
- Desktop copies preserve attachment timestamps, and `exportTo` applies the
  stored mtime on desktop and Android (`MediaStore.DATE_MODIFIED` /
  `File.setLastModified`), so exported files match the attachment.

## [1.3.0] - 2026-11-04

### Added

- The host reports `PULSAR_VERSION` over `host.info`; the runtime compares it
  with the build-time SDK version and logs a mismatch. `pulsar dev` and
  `pulsar doctor` warn about toolchain and Qt-series drift.
- `pulsar build --target android --aab` builds and signs an Android App Bundle
  next to the APK.
- `PULSAR_CRASH_URL` forwards crash records as JSON while `crash.log` stays in
  the app data directory.
- Platform parity is pinned: icons come from the bundled font, the Controls
  style is `Basic` everywhere (`PULSAR_CONTROLS_STYLE` overrides), and icons
  honour `align`. `theme.set({ direction })` mirrors layouts for RTL.
- SDK additions: `t`/`plural`/`direction`, validation combinators,
  `runMigrations`, implicit list keys from `ID`/`id`, one-shot input `focus`,
  and `hostInfo()`.
- `PULSAR_SOURCE` builds apps against a checkout; `pulsar run`, `dev` and
  `build` relink the app SDK to the renderer root so capabilities stay shared.
- `PULSAR_INSPECTOR=1` shows node count, build time, DPR and font scale.
- `virtualList` recycles delegates (`reuseItems`) and animates add, remove and
  move transitions.

### Changed

- Route transitions fade the rebuilt tree instead of grabbing a screenshot;
  `PULSAR_TRANSITION=snapshot|none` switches the behaviour.
- Store mutations coalesce into one render per microtask, and `store.batch()`
  groups explicit work.
- Common UI nodes are created from precompiled components instead of
  `Qt.createQmlObject` per node.

### Fixed

- Portable builds failed with `unknown capability` when the app and runtime
  resolved different SDK copies.
- Inputs no longer keep focus after the Android keyboard closes, mobile
  selects no longer clip their text, and the focused editor field scrolls
  above the keyboard.
- The search hint stays inside the field, empty-search states show
  immediately, and select indicators are anchored to the right.
- Assorted control theming, focus and floating-label fixes across chips,
  buttons, selects, checkboxes and scroll views.

## [1.2.3] - 2026-11-02

### Fixed

- `pulsar build --target android` works after a Pulsar upgrade: a CMake build
  cache generated by another version is cleared instead of failing on a source
  tree mismatch.
- Desktop toolchains and built apps bundle the `QtMultimedia` QML module, the
  multimedia plugins and the TLS/network-information plugins. Windows now
  scans the host QML imports with `windeployqt`, so in-app video and `wss://`
  WebSockets work from release builds.
- The Android Qt bundle ships `qtmultimedia`. An older bundle is detected and
  replaced on `pulsar install --android` or the first Android build.
- Release packaging fails when the staged toolchain misses a QML module or the
  multimedia plugins used by the host.

## [1.2.2] - 2026-11-02

### Fixed

- The Linux Qt bundle includes the libraries QML modules link to
  (`libQt6QuickControls2Impl`, `libQt6QuickLayouts`, `libQt6QuickEffects` and
  the rest), so Qt Quick Controls plugins no longer load system copies and
  fail with a Qt version mismatch. `pulsar run` and `pulsar build` work again
  from the released toolchain.
- The CLI archive ships `CMakeLists.txt`, `host/`, `bridge/`, `launcher/` and
  `android/`, so `pulsar build --target android` works from an installed
  release instead of failing on a missing `CMakeLists.txt`.

## [1.2.1] - 2026-11-02

### Fixed

- Built-in Catppuccin theme tokens (`mauve`, `text`, `subtext`, `surface` and
  the rest) are typed by default, so `EmptyState` and other SDK defaults
  typecheck in apps that do not augment `ThemeColors`.
- `pulsar update` verifies `SHA256SUMS`, accepts `--version <v>`, and relinks
  the current app's `node_modules/pulsar` to the new SDK. Apps created by newer
  CLIs link through `$PULSAR_HOME/current`, so they follow later updates.

## [1.2.0] - 2026-11-02

### Added

- Responsive shell: `createBreakpoints(app)` plus window width/height as
  `window-resize` (desktop and Android rotation/split screen), `NavBar`,
  `NavigationRail` (with a `padding` gutter), `Container` (`maxWidth`),
  `maxWidth`/`align` on layout nodes and `Grid` with `columns: "auto"`.
- `Column` and `Row` now honour `padding` as an outer gutter.
- Components: Avatar (initials/status/badge), Badge (count or dot pill, and a
  `badge` prop on icons/buttons/avatars), Skeleton, Spinner, BottomSheet,
  EmptyState, Toolbar, Fab, Menu, Accordion, Segmented, SearchField,
  RangeSlider, Radio/RadioGroup, Tabs, Pager, Snackbar and Popover.
- Elevation and shadows render through `MultiEffect`; panels support gradients,
  border colours and rounded corners.
- Neon glow on any component (`neon: true` or `NeonOptions`) with
  `MultiEffect`, now on Android too. `effects: false` keeps a plain outline and
  software rendering falls back to it automatically.
- Grid and virtualised list primitives: auto columns, end-reached paging,
  pull-to-refresh, multi-select, sticky sections, swipe actions and drag
  reorder.
- Gestures and layers: long press, tooltips, pinch zoom, pager and overlays.
- Rich text and input: TextArea, password fields, keyboard hints, submit/focus
  callbacks, autofocus, max length, read-only, selectable text, markdown,
  elide, alignment and max lines.
- Screen router (`createRouter`) with a navigation stack and system back
  handling.
- Host-backed media player: playlists, play/pause/seek/rate/volume,
  state/position/duration events, and an Android foreground service with
  MediaSession and lockscreen controls.
- Clipboard, OS share, Android orientation lock and keep-awake, and
  accessibility labels on common nodes.
- Runtime OS permissions (`permissions.request/check`) with `osPermissions` in
  `pulsar.json` mapped into the Android manifest.
- `fs.watch` and `net.download` with progress and Range resume.
- Android notification channels and tap routing; shared text and opened files
  arrive as app events.
- Native macOS menu bar from `app.setMenu([...])`: nested menus, separators,
  shortcuts and checkable items; choosing an item emits `menu` with its id.
  Linux and Windows ignore the call for now.
- Desktop power monitor: `system.power()` returns the power source, battery
  state and percentage; `power-suspend`, `power-resume` and `power-source`
  events fire on sleep and on AC/battery changes. Linux uses logind and UPower
  over D-Bus with a sysfs fallback; other platforms report `unknown`.
- `notify.show` takes `actions: [{ id, title }]`; a button press emits
  `notification-action` with the token and id. Uses the freedesktop
  notification daemon on Linux (D-Bus); other platforms show the plain body.
- Desktop video playback in a built-in full-screen player: `fs.open` on a
  video file plays it in-app when QtMultimedia is available instead of handing
  it to the OS. The release toolchains now bundle QtMultimedia. Tap or Space
  pauses, Escape or the close button exits, with a seek bar and timer.
- Theme work: Catppuccin Frappe/Latte presets, Paper Mono and Material Symbols,
  typed named/CSS colours and custom theme tokens, theme overrides, density and
  font scale, motion tokens and transparent frameless windows.
- `Sheet` / `Modal` take `dismissible` (default `true`) and `duration` (fade
  time in ms, default 140). `dismissible: false` keeps the overlay open on a
  backdrop tap.

### Changed

- `Store.set` is a no-op when the new value is deeply equal to the current one
  (same JSON), so polling sync loops no longer re-render unchanged lists.
- The neon effect is drawn with `MultiEffect` instead of a custom shader.
- Controls default to the neutral Qt Quick Controls Basic style before the
  theme styles them.

### Fixed

- Page scroll now moves its content: the wrapper is parented to the Flickable
  `contentItem` instead of the Flickable itself.
- A `VirtualList` scrolls its own rows again; row swipe gestures are limited to
  the x axis, and a non-interactive list passes drags to the page.
- Column/row and navigation rail padding is applied to the first and last
  visible children, so content stays off card and window edges.
- Neon on Android renders a real glow again; the outline fallback anchors to
  the right item and the demo stacks it vertically on a phone.
- The switch thumb no longer lags when turning on.
- Taps inside a sheet panel no longer fall through to the backdrop and close
  the overlay, and the tap that opened a sheet no longer closes it.
- Sheets fade in and out on opacity instead of scaling, which is cheaper for
  large trees on mobile.
- Text width/elide, grid column stretching, virtual-list row opacity and input
  backgrounds are corrected.
- Desktop file dialogs on Linux use the Qt dialog instead of the platform
  theme's native one, so the picker lists files under a KDE theme outside
  Plasma instead of failing with `Unknown protocol "file"`.
- Builds honour the app's root `.gitignore` and a new manifest `ignore` list,
  and always skip `.env*` and `sync.db*`, so secrets and local databases no
  longer end up in executables, APKs or the Android dev payload.

### Docs

- README (English and Russian) covers the responsive shell, the new components,
  breakpoints, navigation rail padding and neon.

### Tests

- Unit tests for `fs.open`, `fs.exportTo`, `dialog.toast` and the
  `__export-result` reply; media and `fs.watch` tests are isolated from the
  global permission gate.

## [1.1.0] - 2026-11-01

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
- Android dev loop: `pulsar dev --android` builds a dev APK once, serves the
  bundle over `adb reverse` and reloads the app in 1–2 s. Native inputs (host
  C++, manifest, CMake, app id) are fingerprinted, so the APK is rebuilt and
  reinstalled only when they change.
- Device control from the CLI while the dev loop runs: `ui`, `state`, `tap`,
  `type`, `expect`, `shot`, `swipe`, `key` and `eval`, coordinate input with
  `--at`, and `ui --system` for system dialogs.
- A flow-test API (`cli/testing.ts`) for driving a running dev app with
  `tap`, `type`, `expect`, `state` and `shot` from a Bun script.
- In-process reload (`pulsar reload`): the QuickJS context is recreated and the
  store is seeded from the previous session, so JS edits apply in about 200 ms
  without restarting the app.
- A dev error overlay with a Reload button; stack frames are mapped back to the
  TypeScript sources in the terminal and in the overlay via inline source maps.

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
