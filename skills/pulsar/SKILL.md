---
name: pulsar
description: Build, run and test Pulsar apps (native desktop and Android apps in TypeScript, drawn by Qt). Use when a project has a pulsar.json, imports from "pulsar", or the user asks for a Pulsar app, screen, component, build or APK.
---

# Pulsar

Pulsar apps are TypeScript (or TSX) that build a UI tree. A native Qt host draws it with no
browser. One codebase runs on Linux, macOS, Windows and Android. This file covers what you
need day to day. Next to this file:
- `recipes.md`: working patterns for lists, storage, screens, forms, network, settings,
  files, notifications and layouts. Start from these.
- `reference.md`: the full API.
- `components.md`: state and components.
- `ui.md`: layout.

Read them before guessing an API.

## Commands

```sh
pulsar create my-app            # scaffold (templates: default, js, qml, windows, tray)
pulsar dev                      # run with live reload; installs packages on first run
pulsar build                    # one self-contained executable in dist/
pulsar build --target android   # an APK (needs `pulsar install --android` once)
pulsar check                    # which engine the build uses, and whether Bun is bundled
```

Use the `pulsar` commands, not `bun install` or `bun run`: the CLI installs packages itself.

## Project

```
pulsar.json     manifest: id, name, version, main, windows, permissions, targets
src/main.ts     entry: creates the App and renders windows
```

```json
{
  "id": "com.example.notes",
  "name": "notes",
  "version": "0.1.0",
  "main": "src/main.ts",
  "targets": ["desktop", "android"],
  "compat": "portable",
  "windows": [{ "label": "main", "width": 800, "height": 600, "title": "Notes" }],
  "permissions": ["storage", "dialog", "clipboard"]
}
```

- **Permissions gate capabilities.** With a `permissions` list, any capability outside it
  throws. The names are `storage`, `secure`, `fs`, `paths`, `dialog`, `net`, `clipboard`,
  `share`, `notify`, `shell`, `system`, `theme`, `screen`, `tray`, `device`, `media`,
  `permissions`, `biometric` and `scanner`.
- **OS permissions.** Android runtime permissions go in `osPermissions`: `notifications`,
  `camera`, `microphone`, `location`, `storage`, `biometric`.
- **Android** needs `"compat": "portable"`: no Node or Bun APIs anywhere in the app.
- **Video.** The in-app player (FFmpeg) is bundled on desktop and Android when the app uses
  `media`, `MediaPlayer` or `VideoOutput`; `"video": true` or `false` overrides that.
  Android apps with it decode in software by default, because hardware decoding shows a
  green or black picture on some phones.
- **Environment.** `"env": { "NAME": "value" }` in `pulsar.json` sets environment variables
  in every host before Qt reads them. Strings only; a variable already set in the
  environment wins. Do not set `QT_FFMPEG_DECODING_HW_DEVICE_TYPES` to `mediacodec` on
  Android yet: the app crashes on the first frame.

## Engines

Apps run on QuickJS by default; `pulsar check` shows the engine. Bun or Node is bundled
only when the code imports Node or Bun APIs (`fs`, `child_process`, `Bun.*`).

QuickJS has no `TextEncoder`, `atob`/`btoa`, `Intl`, `crypto.getRandomValues` or Node
modules. Use Pulsar's capabilities instead: `crypto.randomBytes` and `crypto.pbkdf2`,
`system.locale()`, `getLocale()`, and `fs` and `net` from "pulsar". Pure-JS npm packages
work.

## UI

```ts
import { App, Button, Column, Text, signal } from "pulsar"

const app = new App()
const count = signal(0)

app.window("main").render(() => {
  return Column(
    { fill: true, padding: 24, gap: 12 },
    Text({ text: `Count: ${count.get()}`, size: 20 }),
    Button({ onClick: () => count.set(count.get() + 1) }, "+1"),
  )
})
app.run()
```

JSX works too (`jsxImportSource: "pulsar"` in tsconfig): `<Column gap={12}>...</Column>`.

**Layout:**
- `Column`, `Row`, `Stack`, `Wrap`, `Grid`.
- `Page` scrolls and has `header` and `footer`.
- `Box`, `Card`, `Scroll`.
- `VirtualList` for long lists.
- `Spacer`, `Divider`.

**Controls:**
- `Text`, `Button`, `IconButton`, `Icon`, `Image`, `Avatar`, `Badge`, `Chip`.
- Fields and toggles: `Input`, `TextArea`, `SearchField`, `Checkbox`, `Switch`, `Radio`, `RadioGroup`.
- Pickers: `Select`, `Slider`, `RangeSlider`, `Segmented`, `Tabs`.
- Overlays and status: `Sheet`, `Menu`, `Popover`, `Snackbar`, `Progress`, `Spinner`, `Skeleton`.
- Navigation: `NavBar`, `NavigationRail`, `Pager`, `Accordion`, `Fab`, `EmptyState`.
- Graphics: `Canvas`, `Shader`, `Wave`, `Aurora`, `Lightning`.
- QML escape hatch: `Qml`.

**Common props** on every node:
- Size: `key`, `width`, `height`, `fill`, `fillWidth`, `fillHeight`, `flex`, `min*`/`max*`.
- Spacing and alignment: `padding*`, `gap`, `justify`, `alignItems`, `align`.
- Surface: `color`, `radius`, `borderColor`, `borderWidth`, `opacity`, `visible`.
- States: `hover`, `pressed`, `disabled`, given as style objects.
- Motion: `enter`, `exit`, `transition`.
- Events: `onClick`, `onLongPress`, `drag`.
- Accessibility: `a11yLabel` (give it to icon buttons), `tooltip`.

Colors are hex strings or theme tokens (`"text"`, `"subtext"`, `"surface"`, `"blue"` and
others).

## State and components

Anything a render reads must be reactive, or the screen will not update:

- `signal(value)`: `get()` reads and subscribes, `set(v)` writes, `peek()` reads without
  subscribing. Values compare by reference, so set a new array or object instead of
  mutating one.
- `createState({ ... })` makes a reactive object for app-wide state; assign its fields
  directly.
- `computed(() => ...)` derives values. `effect(() => ...)` runs side effects, and
  `untracked(fn)` reads without subscribing.
- `app.store` holds values that QML reads or that must survive a reload.

```ts
const Row = component<{ key: string; task: Task }>(({ task }) => {
  return Text({ text: task.title })
})

const Editor = component(() => {
  const draft = signal("") // setup runs once per instance

  return () => Input({ value: draft.get(), onInput: (value) => draft.set(value) })
})
```

- Repeated components need a unique `key`.
- `For` needs `keyOf`.
- For mutually exclusive screens use a ternary, not `visible`.

## App and capabilities

- **`App`:**
  - windows: `app.window(label).render(fn)`, `.setTitle`, `.setSize` and the like;
  - events: `app.on(event, fn)`;
  - also `app.setMenu` (macOS menu bar), `app.quit()` and `app.run()`.
- **Events:**
  - lifecycle: `back-pressed`, `app-pause`, `app-resume`;
  - system: `theme-changed`, `power-resume`, `open-file`, `open-url`;
  - notifications: `notification-click`, `notification-action`;
  - windows: `window-resize`, `window-close` and others.
- **Capabilities** (all async, imported from "pulsar"):
  - data: `storage` (key-value JSON), `secureStorage` (OS keychain), `fs`, `paths`;
  - user interface: `dialog` (`openFile`, `saveFile`, `message`, `toast`), `clipboard`,
    `share`, `notify`;
  - system: `shell.open`, `system.locale()`, `theme`, `screen`, `tray`, `device`, `permissions`;
  - network: `net` (`fetch`, `download`, `websocket`);
  - security: `crypto` (`randomBytes`, `pbkdf2`) and `biometric` (fingerprint, Android);
  - QR: `scanner.scan()` (camera, Android) and the `QrCode` component.
- **Other modules:**
  - i18n: `t`, `setMessages`, `setLocale`;
  - layout: `createBreakpoints`;
  - navigation: `createRouter`;
  - forms: `validate`, `required` and the other rules.

## Design

Screens written straight from primitives look raw. For anything people will look at, add the UI kit (`bun add @pulsar-workshop/ui-kit`, README at https://github.com/pulsar-workshop/ui-kit) and compose screens from it: `Screen`, `Section`, `Panel`, `ListGroup` and `ListRow`, `SettingsRow`, `ActionButton`, `IconTile`, `Tabs` or `Segmented`, `Chip`, `SearchField`, `EmptyState`, `BottomSheet`, `ConfirmDialog`, `createToaster`, `TextField`. Where a name also exists in `pulsar`, import the kit's. Call `applyTheme({ mode })` once, read colours with `colors()` inside render, and use the kit's `space` and `type` tokens instead of raw numbers and hex.

- One primary button per screen; the accent marks the primary action and the selected item only.
- Selection is a soft fill, never a bright border. Tabs are an underline, a segmented control is a pill, never both.
- Spacing is 4, 8, 12, 16, 24 or 32: a 16 px gutter, 24 px between sections.
- Icons use the text colour (muted inside rows), never faint grey. Text keeps 4.5:1 contrast in both themes.
- Flat look: hairline borders, no gradients, glow or heavy shadows.
- Label icon-only buttons, name the action on confirm buttons ("Delete"), and give row titles `maxLines: 1`.

After each screen, take `pulsar shot` at about 400x860 and 1100x750 (window size in `pulsar.json`), in dark and light, and check margins, accent use, icon visibility, overflow, and the empty, error and long-text states.

## See and test the app

If a `pulsar` MCP server is connected, use it:
1. `pulsar_start` runs the app offscreen.
2. `pulsar_ui` and `pulsar_screenshot` show it.
3. Act with `pulsar_click`, `pulsar_type`, `pulsar_key`, `pulsar_hover` and `pulsar_scroll`.
4. Check with `pulsar_wait_for` and `pulsar_logs`.

Source edits reload the running app.

Without MCP, run `pulsar dev` in the background, and from the app folder run:
- `pulsar ui` and `pulsar shot --out shot.png` to see the app;
- `pulsar tap "Save"`, `pulsar keys "text"`, `pulsar key enter`, `pulsar hover "Copy"` to act;
- `pulsar expect "Saved"` to check the result.

Taps and hovers are real input. Icon buttons match by their `a11yLabel`.

## Pitfalls

- Plain variables and mutated arrays do not update the screen.
- A capability missing from `permissions` throws at runtime.
- Node imports silently switch the desktop build to Bun and break Android; keep app code
  portable.
- Long synchronous loops freeze the UI, because QuickJS runs on the UI thread. Await host
  capabilities instead.
- Window menu shortcuts (`setMenu`) exist only in the macOS menu bar.
