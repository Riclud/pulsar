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
  `permissions` and `biometric`.
- **OS permissions.** Android runtime permissions go in `osPermissions`: `notifications`,
  `camera`, `microphone`, `location`, `storage`, `biometric`.
- **Android** needs `"compat": "portable"`: no Node or Bun APIs anywhere in the app.

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
  - security: `crypto` (`randomBytes`, `pbkdf2`) and `biometric` (fingerprint, Android).
- **Other modules:**
  - i18n: `t`, `setMessages`, `setLocale`;
  - layout: `createBreakpoints`;
  - navigation: `createRouter`;
  - forms: `validate`, `required` and the other rules.

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
