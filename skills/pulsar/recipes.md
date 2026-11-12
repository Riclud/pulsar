# Pulsar recipes

Short, working patterns. Each one typechecks against the SDK it ships with. Imports come
from "pulsar". Adapt names and copy; the API details are in `reference.md`.

## 1. App skeleton with shared state

```ts
import { App, Column, Page, Text, createState } from "pulsar"

export const app = new App()

// App-wide state: assign fields directly, renders that read them update.
export const state = createState({
  notes: [] as { id: string; text: string }[],
})

app.window("main").render(() => {
  return Page(
    { padding: 16, gap: 10, header: Text({ text: "Notes", size: 22, weight: "semibold" }) },
    Column({ gap: 8, fillWidth: true }, ...state.notes.map((note) => Text({ key: note.id, text: note.text }))),
  )
})

app.run()
```

## 2. A component with its own state

`setup` runs once; the returned function is the render.

```ts
import { Button, Input, Row, component, signal } from "pulsar"

export const Composer = component<{ onSubmit: (text: string) => void }>((props) => {
  const text = signal("")

  const submit = () => {
    const value = text.peek().trim()

    if (!value) return

    props.onSubmit(value)
    text.set("")
  }

  return () => {
    return Row(
      { gap: 8, fillWidth: true },
      Input({ value: text.get(), placeholder: "New note", expand: true, onInput: (value) => text.set(value), onSubmitted: submit }),
      Button({ onClick: submit }, "Add"),
    )
  }
})
```

## 3. A list with search

Give repeated components a `key`. Hide rows with `visible` instead of filtering, so they
keep their state and animate.

```ts
import { Column, SearchField, Text, component, signal } from "pulsar"

type Note = { id: string; text: string }

export const NoteList = component<{ notes: Note[] }>((props) => {
  const query = signal("")

  return () => {
    const needle = query.get().trim().toLowerCase()

    return Column(
      { gap: 8, fillWidth: true },
      SearchField({ value: query.get(), placeholder: "Search", fillWidth: true, onInput: (value) => query.set(value) }),
      ...props.notes.map((note) => {
        return Text({ key: note.id, text: note.text, visible: note.text.toLowerCase().includes(needle) })
      }),
    )
  }
})
```

For thousands of rows use `VirtualList`:

```ts
import { VirtualList } from "pulsar"

VirtualList({
  fill: true,
  items: contacts.map((contact) => ({ key: contact.id, title: contact.name, subtitle: contact.phone, icon: "person" })),
  swipeActions: [{ id: "delete", icon: "delete", color: "red" }],
  onPress: (key) => openContact(String(key)),
  onAction: (key, action) => action === "delete" && removeContact(String(key)),
})
```

## 4. Save and restore data

`storage` keeps JSON in the app data folder. Write after changes; batch rapid writes.

```ts
import { storage } from "pulsar"

let timer: ReturnType<typeof setTimeout> | null = null

export const save = (): void => {
  if (timer) return

  timer = setTimeout(() => {
    timer = null
    void storage.set("notes", state.notes)
  }, 200)
}

export const restore = async (): Promise<void> => {
  const saved = await storage.get("notes")

  state.notes = Array.isArray(saved) ? saved.filter((item) => typeof item?.id === "string") : []
}
```

Await `restore()` before `app.window().render(...)`. Flush on `app-pause` on Android:
`app.on("app-pause", () => void storage.set("notes", state.notes))`. Secrets such as tokens
go to `secureStorage`, not `storage`.

## 5. Screens and the back button

```ts
import { Box, Button, Column, Text, createRouter } from "pulsar"

const router = createRouter(app, { initial: "list", handleBack: true })

app.window("main").render(() => {
  return Box(
    { fill: true },
    router.view({
      list: () => Button({ onClick: () => router.push("detail", { id: "42" }) }, "Open"),
      detail: (params) => {
        return Column({ gap: 8 }, Text({ text: `Item ${String(params.id)}` }), Button({ onClick: () => router.pop() }, "Back"))
      },
    }),
  )
})
```

`handleBack: true` pops on the Android back button and quits on the last screen. Without a
router, handle `app.on("back-pressed", ...)` and call `app.quit()` only on the root screen.

## 6. A form with validation

```ts
import { Button, Column, Input, Text, component, email, required, signal, validate } from "pulsar"

export const SignUp = component(() => {
  const address = signal("")
  const error = signal<string | null>(null)

  const submit = () => {
    const problem = validate(address.peek(), [required("Enter an email"), email()])

    error.set(problem)

    if (problem) return

    void register(address.peek())
  }

  return () => {
    return Column(
      { gap: 8, fillWidth: true },
      Input({ value: address.get(), placeholder: "Email", keyboardType: "email", onInput: (value) => address.set(value) }),
      error.get() ? Text({ text: error.get() ?? "", color: "red", size: 12 }) : null,
      Button({ onClick: submit }, "Sign up"),
    )
  }
})
```

## 7. Network requests

`net.fetch` returns `{ status, text, headers }` and throws `NetError` on network failure.

```ts
import { NetError, net } from "pulsar"

export const loadTodos = async (): Promise<unknown[] | null> => {
  try {
    const response = await net.fetch("https://api.example.com/todos", {
      headers: { authorization: `Bearer ${token}` },
      timeoutMs: 5000,
    })

    if (response.status < 200 || response.status >= 300) return null

    const body = JSON.parse(response.text) as unknown

    return Array.isArray(body) ? body : null
  } catch (error) {
    if (error instanceof NetError) return null

    throw error
  }
}
```

Send JSON with `method: "POST"`, `headers: { "content-type": "application/json" }` and
`body: JSON.stringify(data)`. Large files: `net.download(url, path, { onProgress })`. Add
`"net"` to `permissions`.

## 8. Settings: theme and language

```ts
import { Segmented, setLocale, setMessages, signal, storage, t, theme } from "pulsar"

const EN: Record<string, string> = { "Задачи": "Tasks" }
export const language = signal<"ru" | "en">("ru")

// Russian text is the key; English comes from the table, so a missing entry still reads.
export const tr = (text: string): string => t(text, {}, text)

export const setLanguage = (next: "ru" | "en"): void => {
  language.set(next)
  setLocale(next)
  setMessages(next === "en" ? EN : {})
  void storage.set("language", next)
}

Segmented({
  items: ["Русский", "English"],
  value: language.get() === "en" ? 1 : 0,
  fillWidth: true,
  onChange: (index) => setLanguage(index === 1 ? "en" : "ru"),
})

void theme.set({ fontFamily: "Noto Sans" })
```

`system.locale()` gives the OS language for the first run. Renders that call `tr` update
when the language changes. The native menu is not in the tree, so rebuild it in an `effect`
that reads `language`.

## 9. Files: pick, read, export

```ts
import { dialog, fs, paths } from "pulsar"

export const importNotes = async (): Promise<string | null> => {
  const path = await dialog.openFile({ title: "Import", filter: "Text (*.txt *.md)" })

  return path ? fs.readFile(path) : null
}

export const exportNotes = async (text: string): Promise<void> => {
  const dirs = await paths.get()
  const file = `${dirs.temp}/notes.txt`

  await fs.writeFile(file, text)
  // Copies the file to the user's Downloads (MediaStore on Android).
  await fs.exportTo(file, "notes.txt")
  await dialog.toast("Exported")
}
```

Needs `"dialog"`, `"fs"` and `"paths"` in `permissions`. App files belong under
`(await paths.get()).data`.

## 10. Notifications and runtime permissions

```ts
import { notify, permissions, platform } from "pulsar"

export const remind = async (title: string): Promise<void> => {
  if (platform().os === "android") {
    if (!(await permissions.request("notifications"))) return

    await notify.channel({ id: "reminders", name: "Reminders", importance: 3 })
  }

  await notify.show({ title, body: "Tap to open", actions: [{ id: "open", title: "Open" }] })
}

app.on("notification-action", (payload: { id?: unknown }) => {
  if (payload?.id === "open") void app.window().focus()
})
```

Manifest: `"permissions": ["notify", "permissions"]`, `"osPermissions": ["notifications"]`.

## 11. Phone and desktop layouts

```ts
import { Column, Row, createBreakpoints } from "pulsar"

const breakpoints = createBreakpoints(app) // compact < 600, medium < 1000, expanded

const Layout = () => {
  return breakpoints.is("compact")
    ? Column({ fill: true }, List(), Details())
    : Row({ fill: true, gap: 16 }, Column({ width: 320 }, List()), Column({ flex: 1 }, Details()))
}
```

Pages scroll by themselves (`Page`), so prefer `Page` with a `header` and a `footer` over a
fixed `Column` on small screens.

## 12. Copy with feedback

```ts
import { clipboard, dialog } from "pulsar"

export const copy = async (text: string): Promise<void> => {
  await clipboard.write(text)
  await dialog.toast("Copied")
}
```

Icon buttons need an `a11yLabel`: screen readers use it, and so do `pulsar tap` and the MCP
tools.

## 13. Scroll from code

One controller per scroll. `scrollToEnd` waits for rows added in the same update.

```ts
import { Button, Column, Page, Text, createScrollController, createState } from "pulsar"

const messages = createState({ list: ["first"] })
const scroll = createScrollController()

export const Chat = (): ReturnType<typeof Page> => {
  return Page(
    {
      controller: scroll,
      footer: Button(
        {
          onClick: () => {
            messages.list = [...messages.list, `message ${messages.list.length + 1}`]
            scroll.scrollToEnd({ animated: true })
          },
        },
        "Send",
      ),
    },
    Column({ gap: 6, fillWidth: true }, ...messages.list.map((text) => Text({ key: text, text }))),
  )
}
```

`scroll.scrollTo(0, { animated: true })` goes back to the top.

## 14. A long list with your own rows

`VirtualList` with `render` draws only the rows near the viewport, so 50,000 items cost the
same as 50. Rows have a fixed `rowHeight`.

```ts
import { Row, Text, VirtualList } from "pulsar"

interface Track {
  id: string
  title: string
  length: string
}

export const Tracks = (tracks: Track[], play: (id: string) => void): ReturnType<typeof VirtualList> => {
  return VirtualList({
    items: tracks,
    rowHeight: 56,
    keyOf: (track) => track.id,
    render: (track) => {
      return Row(
        { gap: 12, alignItems: "center", paddingX: 16, fillWidth: true, onClick: () => play(track.id) },
        Text({ text: track.title, expand: true }),
        Text({ text: track.length, color: "subtext" }),
      )
    },
  })
}
```

## 15. Do something when a row comes into view

`onEnterViewport` and `onVisible` work on any node in a scroll, and only the nodes that ask
are checked, so every row of a long list can use them.

```ts
import { Column, Page, Text, createState } from "pulsar"

const seen = createState({ ids: [] as string[] })

export const Feed = (posts: { id: string; text: string }[]): ReturnType<typeof Page> => {
  return Page(
    {},
    Column(
      { gap: 8, fillWidth: true },
      ...posts.map((post) => {
        return Text({
          key: post.id,
          text: post.text,
          onEnterViewport: () => {
            if (!seen.ids.includes(post.id)) seen.ids = [...seen.ids, post.id]
          },
        })
      }),
    ),
  )
}
```

## 16. Play a video

`Video` plays a file or URL as a node, on the desktop and on Android. Putting `Video` in the
app makes the build bundle the video backend.

```ts
import { Button, Column, Video, createState } from "pulsar"

const player = createState({ paused: false })

export const Clip = (): ReturnType<typeof Column> => {
  return Column(
    { gap: 8, fillWidth: true },
    Video({
      source: "media/intro.mp4",
      autoplay: true,
      loop: true,
      muted: true,
      fillMode: "cover",
      fillWidth: true,
      height: 220,
      paused: player.paused,
      onError: (message) => console.log(`video failed: ${message}`),
    }),
    Button({ onClick: () => (player.paused = !player.paused) }, player.paused ? "Play" : "Pause"),
  )
}
```

The player stops by itself when the node goes away; there is nothing to clean up.

## 17. Keyboard shortcuts

Window-level shortcuts for the desktop. Register them where the screen is built and remove
them when it goes away.

```ts
import { component, onCleanup, shortcuts, Text } from "pulsar"

export const Editor = component<{ save: () => void; close: () => void }>((props) => {
  const removers = [
    shortcuts.register("Ctrl+S", () => props.save()),
    shortcuts.register("Escape", () => props.close()),
  ]

  onCleanup(() => removers.forEach((remove) => remove()))

  return () => Text({ text: "Ctrl+S saves, Escape closes" })
})
```

A bare letter is ignored while a text field has the focus, so `shortcuts.register("J", ...)`
cannot break typing.

## 18. A context menu

`onContextMenu` fires on a right click and on a long press; show the `Menu` at that point.

```ts
import { Box, Column, Menu, Text, createState } from "pulsar"

const ui = createState({ menu: null as { x: number; y: number } | null })

export const Row = (name: string, remove: () => void): ReturnType<typeof Column> => {
  return Column(
    {},
    Box({ onContextMenu: (at) => (ui.menu = at) }, Text({ text: name })),
    Menu({
      open: ui.menu !== null,
      x: ui.menu?.x ?? 0,
      y: ui.menu?.y ?? 0,
      items: [{ id: "delete", label: "Delete", danger: true }],
      onSelect: (id) => id === "delete" && remove(),
      onClose: () => (ui.menu = null),
    }),
  )
}
```

## 19. Check your work

```sh
pulsar check                 # engine and portability
pulsar dev                   # then, from another terminal:
pulsar ui                    # the tree with ids and paths
pulsar tap "Add"             # click by text or icon label
pulsar keys "milk" && pulsar key enter
pulsar expect "milk"
pulsar shot --out shot.png
```

With the `pulsar` MCP server, use `pulsar_start`, `pulsar_ui`, `pulsar_screenshot`,
`pulsar_click` and `pulsar_type` instead.
