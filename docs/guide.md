# Build an app

This guide is a path, not a reference. It starts from an empty project and
builds a small task app one screen at a time. Every section answers the same
question: **which building block do I reach for now?**

If you only need a command, use [Quick start](../quick-start/). If you already
know what you want to build and need an option name, use
[UI building blocks](../ui/) and the [API tour](api/).

## The mental model

A Pulsar app has three layers:

```
pulsar.json        manifest: id, entry point, windows, permissions
main.ts            your TypeScript: data, UI tree, event handlers, OS calls
host               Qt process: renders the tree and owns native windows
```

`main.ts` does not generate HTML. It returns a **tree of components**, and the
host updates that tree in place. A component is a plain function such as
`Column(...)` or `Button(...)`, so the UI is ordinary TypeScript that happens to
describe layout.

The most important object is `app.store`:

- it is a JSON-safe key/value map;
- each key is tracked: a render that read it runs again when it changes, and
  nothing else does;
- its values are also published to QML;
- the host keeps focus, scroll and input state where it can.

For state that only your TypeScript reads, [signals](components/) are lighter. New
to native UI? Start with [Coming from the web](web/).

The rule of thumb: **data goes in the store; the UI is a function of the
store.** Local variables are fine for values that are created inside a render.

## Start from the template

```sh
pulsar create my-app
cd my-app
pulsar dev
```

The generated project is small:

```
my-app/
  pulsar.json     app id, window defaults, entry point
  main.ts         UI and state
  assets/icon.png
  package.json
  tsconfig.json
```

`pulsar.json` supplies the first window. `main.ts` runs through Bun on the
desktop and QuickJS on Android, so keep the app portable if you target Android
(`"targets": ["android"]`, `"compat": "portable"` in the manifest).

## The smallest screen

```ts
import { App, bind, Button, Column, Header, Text } from "pulsar"

const app = new App()

app.store.set("count", 0)

app.window("main").render(() =>
  Column(
    { fill: true, padding: 24, gap: 16 },
    Header({ title: "Hello" }),
    Text({ size: 20, text: bind(() => `Count: ${app.store.get("count")}`) }),
    Button(
      {
        onClick: () => app.store.set("count", (app.store.get("count") as number) + 1),
      },
      "+1",
    ),
  ),
)

app.run()
```

What happens when you press the button:

1. `onClick` writes a new number to the store.
2. The render read that key, so it is marked to run again.
3. `render` runs and produces a new tree for that part of the screen.
4. The host patches the existing `Text` instead of recreating the window.

`bind(() => ...)` marks a value read when the owning component renders. A plain
function in an `on*` prop is an event handler, not a binding.

## Choose the right building block

| What the user needs         | Start with                                         |
| --------------------------- | -------------------------------------------------- |
| A page                      | `Column({ fill: true, padding })` under a `Scroll` |
| A section inside a page     | `Card` or `Box`                                    |
| A title bar with actions    | `Header` (alias `AppBar`) or `Toolbar`             |
| Rows and columns of content | `Row`, `Column`, `Spacer`                          |
| A small fixed list          | `For`                                              |
| A long or dynamic list      | `VirtualList`                                      |
| A grid of tiles             | `Grid({ columns: "auto" })`                        |
| A text field                | `Input` or `SearchField`                           |
| A multi-line field          | `TextArea`                                         |
| A boolean choice            | `Checkbox` or `Switch`                             |
| One of several options      | `RadioGroup`, `Select`, `Segmented`                |
| A number range              | `Slider`, `RangeSlider`                            |
| A dialog                    | `Modal` on desktop, `BottomSheet` on phones        |
| A menu or floating panel    | `Menu`, `Popover`                                  |
| Primary navigation          | `NavBar` (phone), `NavigationRail` (desktop)       |
| Tabs inside a screen        | `Tabs`, `Segmented`, `Pager`                       |
| Loading                     | `Spinner`, `Skeleton`, `Progress`                  |
| Empty state                 | `EmptyState`                                       |
| Transient confirmation      | `Snackbar`                                         |
| A badge or avatar           | `Badge`, `Avatar`                                  |

The detailed props for each one are in [UI building blocks](../ui/).

## Layout that does not fight you

`Column` and `Row` are the two containers you will use most. Both accept `gap`,
`padding`, `fill`, `fillWidth`, `fillHeight`, `align`, `justify`, `alignItems` and
the background props of `Box`.

```ts
Column(
  { fill: true, padding: 16, gap: 12 },
  Header({ title: "Settings" }),
  Card({ padding: 16 }, Text("Account")),
  Spacer({ fillHeight: true }),
  Text({ size: 12, text: "Version 1.0.0" }),
)
```

- `fill: true` makes the page take the window.
- `padding` is an outer gutter. It applies to the first and last visible child,
  so content does not sit against a card or window edge.
- `Spacer` pushes things apart; `fillWidth`/`fillHeight` decide in which axis.
- Put content that can exceed the window inside `Scroll` rather than shrinking
  every text size.

For wide windows, center the content instead of stretching it:

```ts
Container({ maxWidth: 840, padding: 24 }, Column({ gap: 16 } /* page content */))
```

For responsive navigation:

```ts
const bp = createBreakpoints(app)

// inside render
bp.atLeast("medium")
  ? Row({ fill: true }, NavigationRail({ items, index, onChange }), content)
  : Column({ fill: true }, content, NavBar({ items, value, onChange }))
```

The current breakpoint is also published as `Store.breakpoint`. Window sizes
arrive as the `window-resize` event, including Android rotation and split
screen.

## State, events and derived values

The store only accepts JSON values: objects, arrays, strings, finite numbers,
booleans and `null`. Class instances, functions, `undefined` and circular
objects are rejected with an error.

```ts
app.store.set("filter", "open")
app.store.get("filter") // unknown; cast or narrow it
app.store.has("filter")
app.store.delete("filter")
```

A `set` with the same value is a no-op. Values are compared by reference, so
mutating an array in place does not notify the UI:

```ts
const tasks = app.store.get("tasks") as Task[]

// no re-render: the same array
tasks.push(newTask)

// re-render: a new array
app.store.set("tasks", [...tasks, newTask])
```

Keep derived values as functions instead of extra store keys:

```ts
const tasks = (): Task[] => app.store.get("tasks") as Task[]
const openTasks = (): Task[] => tasks().filter((task) => !task.done)
```

For asynchronous work, write a pending flag and handle errors in the event
handler:

```ts
const load = async () => {
  app.store.set("loading", true)

  try {
    const notes = await storage.get("notes")
    app.store.set("notes", Array.isArray(notes) ? notes : [])
  } catch (error) {
    app.store.set("error", String(error))
  } finally {
    app.store.set("loading", false)
  }
}
```

Never leave a promise unhandled: a rejected event handler is reported by the
dev overlay but does not fix the screen state for you.

## A realistic list

The task app uses a store-backed array and one row component:

```ts
import { App, bind, Button, Checkbox, Column, EmptyState, For, Header, IconButton, Input, Row, Spacer } from "pulsar"

interface Task {
  id: string
  text: string
  done: boolean
}

const app = new App()

app.store.set("tasks", [] as Task[])
app.store.set("draft", "")

const tasks = (): Task[] => app.store.get("tasks") as Task[]
const save = (next: Task[]): void => app.store.set("tasks", next)

const add = (): void => {
  const text = String(app.store.get("draft")).trim()
  if (!text) return

  save([...tasks(), { id: String(Date.now()), text, done: false }])
  app.store.set("draft", "")
}

app.window("main").render(() =>
  Column(
    { fill: true, padding: 16, gap: 12 },
    Header({
      title: "Tasks",
      subtitle: bind(() => `${tasks().filter((task) => !task.done).length} left`),
    }),
    Row(
      { gap: 8, fillWidth: true },
      Input({
        placeholder: "New task",
        value: bind(() => String(app.store.get("draft"))),
        onInput: (value) => app.store.set("draft", value),
        onSubmitted: add,
        expand: true,
      }),
      Button({ icon: "add", onClick: add }, "Add"),
    ),
    EmptyState({
      visible: tasks().length === 0,
      icon: "checklist",
      title: "No tasks yet",
      text: "Add the first one above.",
    }),
    For({
      each: tasks(),
      keyOf: (task) => task.id,
      spacing: 8,
      render: (task) =>
        Row(
          { gap: 8, fillWidth: true },
          Checkbox({
            label: task.text,
            checked: task.done,
            onToggle: (done) => save(tasks().map((item) => (item.id === task.id ? { ...item, done } : item))),
          }),
          Spacer({ fillWidth: true }),
          IconButton({
            icon: "delete",
            onClick: () => save(tasks().filter((item) => item.id !== task.id)),
          }),
        ),
    }),
  ),
)

app.run()
```

Why this works:

- `keyOf` keeps rows stable when items move.
- every mutation creates a new array and a new item object;
- `onToggle` receives the new boolean;
- the input writes to the store, so a re-render does not lose the draft.

For thousands of rows, replace `For` with `VirtualList`. Its items are simple
`{ title, subtitle, icon, trailing, section }` records; use `onPress`,
`onSelect`, `onAction` and the list options for selection, swipe actions,
refresh and reorder.

## Screens and navigation

`createRouter(app)` keeps a stack and publishes the current route to the store
under `route`:

```ts
import { createRouter } from "pulsar"

const router = createRouter(app)

router.push("settings", { tab: "account" })

app.window("main").render(() =>
  router.view({
    home: () => HomeScreen(),
    settings: (params) => SettingsScreen({ tab: String(params.tab) }),
  }),
)
```

The system back button pops the stack; on an empty stack it quits. Pass
`handleBack: false` to handle back yourself. `router.push`, `replace`, `pop`,
`reset`, `current`, `entries`, `canGoBack` and `depth` cover most apps.

For tab-like navigation inside one screen, use `Tabs` for a header strip,
`Segmented` for a compact switcher, and `Pager` for swipeable pages.

## Data and the operating system

All native access is imported from `pulsar` and works the same on desktop and
Android where the platform supports it.

```ts
import { dialog, fs, net, notify, paths, storage } from "pulsar"

const file = await dialog.openFile({ title: "Open" })
if (file) {
  const text = await fs.readFile(file)
  app.store.set("document", text)
}

await fs.writeFile(`${(await paths.get()).data}/notes.txt`, "hello")

const response = await net.fetch("https://api.example.com/items")
const items = JSON.parse(response.text)

await storage.set("lastSync", Date.now())
await notify.show({ title: "Synced", body: `${items.length} items` })
```

What to use:

| Need                                | Module               |
| ----------------------------------- | -------------------- |
| Read/write local files              | `fs`                 |
| App data, config, cache directories | `paths`              |
| JSON preferences                    | `storage`            |
| Tokens and passwords                | `secureStorage`      |
| HTTP, streaming, WebSocket          | `net`                |
| Native pickers and messages         | `dialog`             |
| Clipboard, share sheet              | `clipboard`, `share` |
| Screen orientation, keep-awake      | `device`             |
| System permissions                  | `permissions`        |
| Notifications                       | `notify`             |
| Audio/video playback                | `media`              |

Network and filesystem work runs in the native host on Android, not on the UI
thread, so a slow request does not freeze the tree.

## Build and ship

```sh
pulsar build                  # dist/<name>, one executable
pulsar build --target android # dist/<name>.apk
```

Desktop builds bundle the Bun runtime and, unless you pass `--slim`, Qt. Android
builds use QuickJS and compile the app into an APK; the first build downloads
the Android toolchain once.

Before shipping:

- set `id`, `name`, `version` and `icons` in `pulsar.json`;
- declare only the permissions the app needs;
- add `osPermissions` for camera, microphone, location, notifications or
  storage on Android;
- test the layout at a narrow window and at 200% zoom;
- handle the loading, empty and error states, not only the happy path;
- keep `main.ts` free of `node:` and `bun:` imports if the app targets Android.

## Common mistakes

- **Using local variables as state.** The screen does not see them; use a
  [signal, `createState` or the store](components/).
- **Reading plain module variables in a render.** They are not tracked, so the
  screen will not update. Use `createState`.
- **Mutating arrays or objects in place.** Values are compared by reference;
  create a new value instead.
- **Forgetting `key` on repeated components.** Rows can then swap their state.
- **Forgetting `keyOf` in `For`.** Rows can then be reused with the wrong state.
- **Using `For` for a huge list.** Use `VirtualList`.
- **Putting every branch in `visible`.** Use `When({ test, then, else })` or a
  normal ternary for mutually exclusive screens.
- **Blocking the UI with a long synchronous loop.** Await host capabilities or
  split the work.
- **Storing class instances.** Serialize to plain JSON first.
- **Assuming QML.** The default template is TypeScript; QML is an escape hatch.

## Next

- [Coming from the web](web/) — what `Box`, `Row` and `Stack` are, in CSS terms.
- [Components and signals](components/) — local state, props and lifecycle.
- [UI building blocks](../ui/) — every component, prop and pattern.
- [API tour](api/) — windows, store, files, network and devices.
- [The manifest](../manifest/) — every `pulsar.json` field.
- [CLI](../cli/) — create, run, build and inspect.
