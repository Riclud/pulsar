# UI building blocks

Pulsar's UI is a tree of function calls. This page is the catalogue: what each
block is for, the props that matter, and the patterns that keep a screen
readable. Start with [Build an app](../guide/) if you want a guided path.

## How a component call works

Every component is a function. The first argument is a props object, the rest
are children:

```ts
Button({ icon: "add", onClick: add }, "Add task")

Card({ padding: 16 }, Text({ size: 14 }, "A card with one child"))
```

Props are plain values. Text can also be passed as a child:

```ts
Text({ size: 20, weight: "semibold" }, "Hello")
Text({ size: 20, text: "Hello" })
```

In a `.tsx` file the same calls can be written as tags. Both forms compile to the same
thing, and `.ts` and `.tsx` files import each other. See
[JSX](../guide/web/#jsx) for the setup.

```tsx
<Button icon="add" onClick={add}>Add task</Button>

<Card padding={16}>
  <Text size={14}>A card with one child</Text>
</Card>
```

### Props shared by every node

| Prop                       | Meaning                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `width` / `height`         | Fixed size in pixels.                                            |
| `fill`                     | Take the available space.                                        |
| `fillWidth` / `fillHeight` | Take the available width or height inside a `Row`/`Column`.      |
| `align`                    | Horizontal placement: `start`, `center`, `end`, `left`, `right`. |
| `maxWidth`                 | Cap the width; with `align: "center"` it stays centered.         |
| `visible`                  | Hide but keep the node in the tree.                              |
| `opacity`                  | 0 to 1.                                                          |
| `animate`                  | Fade opacity changes over this many milliseconds.                |
| `tooltip`                  | Hover tooltip text.                                              |
| `a11yLabel`                | Name announced by screen readers.                                |
| `a11yHint`                 | Extra hint announced after the name.                             |
| `neon`                     | `true` or `NeonOptions` for a glow around the node.              |
| `key`                      | Stable identity inside a list.                                   |

### Events

Event props use web names and receive the new value where it makes sense:

- `onClick()` on buttons, icons and chips;
- `onInput(value)` on text fields and search;
- `onToggle(checked)` on checkboxes and switches;
- `onChange(value)` on sliders, selects, radios, tabs and segmented controls;
- `onClose()` on overlays;
- `onPress(key)` and `onAction(key, actionID)` on `VirtualList`;
- `onLongPress()` on cards, boxes, images, buttons and chips.

```ts
Input({
  value: bind(() => String(app.store.get("query"))),
  onInput: (query) => app.store.set("query", query),
})
```

`bind(() => ...)` is for **reads**. A plain function in an `on*` prop is a
**write**.

### Layout props

Every node accepts these, in addition to `Row`, `Column`, `Box`, `Card` and the
rest of the table above:

| Prop                                       | Meaning                                                             |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `paddingX`, `paddingY`                     | Horizontal and vertical padding on layouts, `Box` and `Card`.       |
| `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | One side; wins over `paddingX`, `paddingY` and `padding`. |
| `justify`                                  | `Row`/`Column`: `start`, `center`, `end`, `between`, `around`, `evenly`. |
| `alignItems`                               | `Row`/`Column`: `start`, `center`, `end`, `stretch` on the cross axis. |
| `flex`                                     | Share of the free space along the parent `Row` or `Column`.         |
| `minWidth`, `minHeight`, `maxHeight`       | Size limits inside a layout.                                        |
| `clip`                                     | Cut off content outside the node.                                   |
| `zIndex`                                   | Stacking order among siblings.                                      |
| `absolute`                                 | `{ top, right, bottom, left }` offsets. Only inside a `Stack`.      |

`Row`, `Column`, `Wrap` and `Stack` also accept the surface props of `Box`:
`color`, `hoverColor`, `radius`, `borderWidth`, `borderColor`, `gradient`,
`elevation`, `shadowColor`, `onClick` and `onLongPress`.

```ts
Row(
  { color: "surface", radius: 12, paddingX: 16, paddingY: 8, justify: "between", alignItems: "center" },
  Text({ text: "Title" }),
  Button({ label: "OK" }),
)
```

A `Row` or `Column` is as wide as its content unless it has `fillWidth`. See
[Coming from the web](../guide/web/).

### Motion props

Motion runs in the renderer, so it stays smooth even while JavaScript is busy.

| Prop         | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| `hover`      | `{ color, borderColor, opacity, scale }` while the pointer is over the node.    |
| `pressed`    | The same, while the node is held down.                                          |
| `disabled`   | The same, while `enabled` is false.                                             |
| `enabled`    | `false` ignores input on the node and everything inside it.                     |
| `enter`      | `{ opacity, x, y, scale }` to animate from when it appears or becomes visible.  |
| `exit`       | The same, to animate to before it is removed or hidden.                         |
| `transition` | `{ duration, curve }`; `curve` is `spring`, `ease` or `linear`.                 |
| `drag`       | `{ axis, threshold, onRelease }`; follows the finger, then springs back.        |

```ts
Card(
  {
    key: task.id,
    pressed: { scale: 0.98 },
    enter: { opacity: 0 },
    exit: { opacity: 0 },
    transition: { duration: 180 },
    drag: {
      axis: "x",
      onRelease: ({ direction }) => {
        if (direction === "right") complete(task)
      },
    },
  },
  Text({ text: task.text }),
)
```

`color` and `borderColor` apply to `Box`, `Card` and layouts with a surface, while
`opacity` and `scale` work on any node. States animate over `transition.duration`,
120 ms by default. `hoverColor` is short for `hover: { color }`.

`enter` does not run on the first render or for a node created with a new parent.
`onRelease` fires only past `threshold`, 96 pixels by default.

## Layout

### Column and Row

`Column` stacks children vertically, `Row` horizontally. Both accept `gap`,
`padding`, `fill`, `fillWidth`, `fillHeight` and `align`. With spare space, children
stay together at the start, as in flexbox. `fillWidth` and `fillHeight` always fill
the parent. A window has no margin of its own, so give the root node a `padding`.

```ts
Row(
  { gap: 8, fillWidth: true, padding: 12 },
  Icon({ name: "search" }),
  Text({ expand: true }, "Search results"),
  IconButton({ icon: "close", onClick: clear }),
)
```

- `padding` is an outer gutter for the first and last visible child.
- `expand: true` on a child lets it take the remaining space.
- Use `Spacer({ fillWidth: true })` or `Spacer({ fillHeight: true })` to push
  siblings apart.
- Nesting deeper than two levels is usually a sign to extract a
  [`component`](../guide/components/).

### Box and Card

Both are surfaces. `Card` is the usual choice for a section; `Box` is a plain
rectangle.

```ts
Card(
  {
    padding: 16,
    radius: 10,
    elevation: 1,
    borderColor: "gray",
    borderWidth: 1,
    gradient: { from: "#1a1717", to: "#131010", direction: "vertical" },
  },
  Text({ weight: "medium" }, "Account"),
  Text({ size: 12, color: "gray" }, "Signed in as demo@example.com"),
)
```

| Prop                                | Effect                          |
| ----------------------------------- | ------------------------------- |
| `padding`, `radius`                 | Inner spacing and corners.      |
| `color`                             | Fill color.                     |
| `borderColor`, `borderWidth`        | Outline.                        |
| `gradient: { from, to, direction }` | Linear gradient fill.           |
| `elevation`, `shadowColor`          | Shadow level and tint.          |
| `onLongPress`                       | Context-menu style interaction. |

### Scroll, Container, Spacer, Divider

- `Scroll` makes a page scroll when its content is taller than the window. It follows
  the Android fling curve and stretches at the bottom edge; `overscroll: false` and
  `flick: false` turn those off.
- `Container({ maxWidth, padding })` centers and caps content on wide windows.
- `Spacer` fills leftover space in the main axis.
- `Divider` is a one-pixel separator.

```ts
Scroll(
  { fill: true },
  Container({ maxWidth: 840, padding: 24 }, Column({ gap: 16 }, Header({ title: "Settings" }), settingsSections())),
)
```

### Grid

`Grid` places children in columns. A fixed number is fine for dashboards;
`"auto"` derives the count from the width.

```ts
Grid(
  { columns: "auto", minColumnWidth: 180, gap: 12, padding: 16 },
  tiles.map((tile) => Card({ padding: 12 }, Text(tile.title))),
)
```

### When and conditionals

`When({ test, then, else })` is for mutually exclusive branches. A normal
ternary is fine for a small choice.

```ts
When({
  test: () => app.store.get("loading") === true,
  then: () => Spinner({ size: 24 }),
  else: () => For({ each: items(), keyOf: (item) => item.id, render: row }),
})
```

`visible` is for hiding one node, not for switching between full screens. To keep a
whole screen between visits, use [`KeepAlive`](../guide/components/#keep-a-screen-alive).

## Text and content

### Text

```ts
Text({
  text: "Release notes",
  size: 18,
  weight: "semibold",
  color: "black",
  align: "left",
  maxLines: 3,
  elide: "right",
  selectable: true,
})
```

- `size` is in pixels; `weight` is `light`, `normal`, `medium`, `semibold`,
  `bold` or a number.
- `markdown: true` renders Markdown instead of plain text.
- `elide` cuts overflow at `left`, `right`, `middle` or `true` (right).
- `wrap: false` keeps a single line; `maxLines` limits wrapped lines.
- `selectable` lets the user copy the text.

### Image and Icon

```ts
Image({ src: "assets/cover.png", fillMode: "PreserveAspectCrop", height: 180 })
Icon({ name: "settings", size: 20, color: "gray", badge: "dot" })
```

Icons use [Material Icons](https://fonts.google.com/icons) names such as `add`,
`delete`, `edit`, `check`, `arrow_back`, `close`, `search`, `settings`.

### Avatar and Badge

```ts
Avatar({
  src: user.avatarURL,
  name: user.name,
  size: 40,
  status: "online",
  badge: 3,
})

Badge({ count: 12 })
Badge({ dot: true, color: "green" })
```

`Avatar` falls back to initials when `src` is missing. `status` is `online`,
`away`, `busy` or `offline`. `badge` is a count or `"dot"`.

### Chip

```ts
Chip(
  {
    variant: "outline",
    selected: filters.includes("open"),
    onClick: () => toggleFilter("open"),
    onRemove: () => removeFilter("open"),
  },
  "Open",
)
```

`variant` is `solid`, `soft` or `outline`. Removable chips show a close action.

## Actions

### Button

```ts
Button(
  {
    variant: "solid",
    size: "md",
    icon: "save",
    iconPosition: "left",
    enabled: !saving,
    expand: true,
    onClick: save,
  },
  "Save",
)
```

Variants: `solid`, `soft`, `outline`, `ghost`, `elevated`. Sizes: `sm`, `md`,
`lg`. `badge` adds a count or dot; `onLongPress` adds a secondary action.

### IconButton and Fab

```ts
IconButton({ icon: "delete", color: "red", badge: "dot", onClick: remove })

Fab({
  icon: "add",
  placement: "bottom-end",
  onClick: createTask,
})
```

`Fab` placement is `bottom-end` (floating over the content) or `inline` (kept
in the layout).

## Input

### Input and TextArea

```ts
Input({
  variant: "outline",
  placeholder: "Email",
  keyboardType: "email",
  autoFocus: true,
  maxLength: 120,
  value: bind(() => String(app.store.get("email"))),
  onInput: (value) => app.store.set("email", value),
  onSubmitted: submit,
  onFocus: () => app.store.set("focused", true),
  onBlur: () => app.store.set("focused", false),
})

TextArea({
  placeholder: "Notes",
  lines: 5,
  onInput: (value) => app.store.set("notes", value),
})
```

`value` also works while the field has focus, so clearing it after a submit just means
setting it to an empty string. What the user is typing is not overwritten by its own
echo. A field with `onSubmitted` shows a Done key instead of Next. `focusBorderColor`
sets the outline while focused.

- `variant`: `filled` or `outline`.
- `password` masks the value.
- `keyboardType`: `text`, `email`, `number`, `decimal`, `phone`, `url`,
  `search`.
- `readOnly` keeps the value selectable but not editable.
- `TextArea` is `Input({ multiline: true })` with `lines` for its height.

### SearchField

```ts
SearchField({
  placeholder: "Search tasks",
  debounce: 200,
  value: bind(() => String(app.store.get("query"))),
  onInput: (query) => app.store.set("query", query),
  onSubmit: search,
  onClear: () => app.store.set("query", ""),
})
```

`debounce` delays `onInput`; `onSubmit` fires on Enter. The field draws its own
search icon and clear button.

### Checkbox and Switch

```ts
Checkbox({
  label: "Remember me",
  checked: bind(() => app.store.get("remember") === true),
  onToggle: (checked) => app.store.set("remember", checked),
})

Switch({ label: "Wi-Fi", checked: wifi, onToggle: (value) => setWiFi(value) })
```

Both receive `onToggle(checked)`, not `onChange`.

### RadioGroup

```ts
RadioGroup({
  options: [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ],
  value: bind(() => String(app.store.get("scheme"))),
  direction: "horizontal",
  onChange: (value) => app.store.set("scheme", value),
})
```

`options` accepts strings or `{ value, label }`. `Radio(label, options)` is the
standalone control.

### Slider and RangeSlider

```ts
Slider({
  min: 0,
  max: 100,
  value: bind(() => Number(app.store.get("volume"))),
  onChange: (value) => app.store.set("volume", value),
})

RangeSlider({
  min: 0,
  max: 100,
  from: 20,
  to: 60,
  step: 5,
  onChange: (from, to) => app.store.set("range", { from, to }),
})
```

Both accept `expand: true` to fill the row.

### Select and Segmented

```ts
Select({
  options: ["Low", "Normal", "High"],
  value: bind(() => String(app.store.get("priority"))),
  onChange: (value) => app.store.set("priority", value),
})

Segmented({
  items: ["All", "Open", "Done"],
  value: bind(() => Number(app.store.get("tab"))),
  onChange: (index) => app.store.set("tab", index),
})
```

`Select` opens a native-style menu; `Segmented` is an inline, compact choice
for two to four options.

## Navigation

### Header and Toolbar

```ts
Header({
  title: "Inbox",
  subtitle: "12 unread",
  onBack: () => router.pop(),
  actions: [IconButton({ icon: "search", onClick: openSearch }), IconButton({ icon: "more_vert", onClick: openMenu })],
})

Toolbar(
  { padding: 8 },
  Text({ weight: "medium" }, "Filter"),
  Spacer({ fillWidth: true }),
  Button({ variant: "ghost", onClick: clear }, "Clear"),
)
```

`Header` is a top app bar; `Toolbar` is a surface row for controls inside a
screen. `onBack` adds a back arrow.

### Tabs and Pager

```ts
Tabs({
  items: ["Overview", "Activity", "Settings"],
  index: bind(() => Number(app.store.get("tab"))),
  onChange: (index) => app.store.set("tab", index),
})

Pager(
  { index: bind(() => Number(app.store.get("page"))), onPageChange: (page) => app.store.set("page", page) },
  overview(),
  activity(),
  settings(),
)
```

`Tabs` is a strip; `Pager` shows one child at a time and supports swipes with
`interactive: true`.

### NavBar and NavigationRail

```ts
const items = [
  { label: "Home", icon: "home" },
  { label: "Search", icon: "search" },
  { label: "Profile", icon: "person" },
]

NavBar({
  items,
  value: bind(() => Number(app.store.get("section"))),
  onChange: (index) => app.store.set("section", index),
})

NavigationRail({
  items,
  index: bind(() => Number(app.store.get("section"))),
  expanded: true,
  padding: 8,
  onChange: (index) => app.store.set("section", index),
})
```

`NavBar` is for narrow screens, `NavigationRail` for wide windows. Use
`createBreakpoints(app)` to pick one.

## Overlays

### Modal and Sheet

```ts
Modal(
  {
    open: bind(() => app.store.get("editing") === true),
    title: "New task",
    dismissible: true,
    duration: 140,
    onClose: () => app.store.set("editing", false),
  },
  Input({ placeholder: "Task" }),
  Button({ onClick: save }, "Add"),
)
```

`Modal` is an in-tree overlay. It fades on opacity, keeps taps inside the panel
and does not close from the gesture that opened it. `dismissible: false` keeps
it open on a backdrop tap.

### BottomSheet

`BottomSheet` is `Sheet` with `placement: "bottom"`. It is the phone-friendly
alternative to a centered dialog:

```ts
BottomSheet(
  {
    open: bind(() => app.store.get("actions") === true),
    title: "Task actions",
    handle: true,
    onClose: () => app.store.set("actions", false),
  },
  Button({ variant: "ghost", expand: true, onClick: duplicate }, "Duplicate"),
  Button({ variant: "ghost", expand: true, color: "red", onClick: remove }, "Delete"),
)
```

### Menu and Popover

```ts
Menu({
  open: bind(() => app.store.get("menu") === true),
  items: [
    { id: "rename", label: "Rename", icon: "edit" },
    { id: "duplicate", label: "Duplicate", icon: "content_copy", shortcut: "CmdOrCtrl+D" },
    { separator: true },
    { id: "delete", label: "Delete", icon: "delete", danger: true },
  ],
  onSelect: (id) => runAction(id),
  onClose: () => app.store.set("menu", false),
})

Popover({ open: bind(() => app.store.get("info") === true), x: 24, y: 64, onClose: closeInfo }, Text("Floating panel"))
```

`Menu` supports icons, shortcuts, separators, disabled items and danger items.
Esc and a click outside close it.

### Accordion

```ts
Accordion(
  { multiple: true, onChange: (index, open) => console.log(index, open) },
  AccordionSection({ title: "Account", icon: "person" }, accountFields()),
  AccordionSection({ title: "Privacy", icon: "lock", defaultOpen: true }, privacyFields()),
)
```

Sections keep their open state locally; `open` can control it from outside.

### Snackbar

```ts
Snackbar({
  open: bind(() => app.store.get("toast") === true),
  text: "Task deleted",
  actionLabel: "Undo",
  duration: 3000,
  onAction: undo,
  onClose: () => app.store.set("toast", false),
})
```

## Feedback and state

### Progress, Spinner and Skeleton

```ts
Progress({ value: 0.4 })

Spinner({ size: 24 })
Spinner({ size: 24, value: 0.6 })

Skeleton({ variant: "text", width: 220 })
Skeleton({ variant: "circle", width: 40, height: 40 })
Skeleton({ variant: "rect", height: 120, radius: 8 })
```

`Spinner` without `value` is indeterminate; `value` from 0 to 1 shows
determinate progress. `Skeleton` variants are `text`, `rect` and `circle`.

### EmptyState

```ts
EmptyState({
  icon: "inbox",
  title: "Inbox is empty",
  text: "New messages will appear here.",
  action: Button({ variant: "soft", onClick: refresh }, "Refresh"),
})
```

Use it for the empty branch, not for errors. For errors, show the message and a
retry action in a `Card` or `EmptyState`.

## Lists

### For and List

`For` builds a scrollable list from an array:

```ts
For({
  each: tasks(),
  keyOf: (task) => task.id,
  spacing: 8,
  padding: 12,
  render: (task) => TaskRow({ task }),
})
```

- `keyOf` is required for stable rows when items are inserted, removed or moved.
- `render` receives the item and its index.
- `List` is the lower-level form with the same options.

For tens of thousands of rows use `VirtualList`; do not render them all.

### VirtualList

```ts
VirtualList({
  items: tasks().map((task) => ({
    key: task.id,
    title: task.text,
    subtitle: task.done ? "Done" : "Open",
    icon: task.done ? "check_circle" : "radio_button_unchecked",
    trailing: task.due,
  })),
  selectable: true,
  selected: selectedIDs(),
  refreshable: true,
  stickySections: true,
  swipeActions: [{ id: "delete", label: "Delete", icon: "delete", color: "red" }],
  onPress: (key) => openTask(String(key)),
  onSelect: (key, selected) => toggleSelection(String(key), selected),
  onAction: (key, action) => runListAction(String(key), action),
  onRefresh: reload,
  onEndReached: loadMore,
})
```

Virtual lists use a fixed item shape (`title`, `subtitle`, `icon`, `trailing`,
`section`). If a row needs arbitrary components, use `For`/`List` instead.

### Grid

Use `Grid` for a gallery or dashboard; use `VirtualList` for long uniform rows.

## Theming

### Colors

`color` props accept named CSS colors (`"black"`, `"tomato"`, `"transparent"`),
hex strings, `rgb()`/`hsl()` strings, and custom theme tokens.

```ts
Text({ color: "tomato" }, "Named")
Text({ color: "#7c5cff" }, "Hex")
Text({ color: "brand" }, "Custom token")
```

### theme.set

```ts
await theme.set({
  palette: {
    background: "#131010",
    surface: "#1a1717",
    primary: "#3369ff",
    text: "#b8b2b2",
    textSecondary: "#8b8484",
    border: "#2b2727",
    radius: 8,
    spacing: 12,
  },
  colors: { brand: "#ff5c8a" },
  density: 1,
  fontScale: 1,
  fontFamily: "Paper Mono",
  iconFamily: "Material Symbols Rounded",
  motion: { fast: 90, normal: 160, slow: 260 },
})
```

Presets are exported as `catppuccinTheme("frappe" | "latte")`. Custom tokens can
be typed by augmenting `ThemeColors`:

```ts
declare module "pulsar" {
  interface ThemeColors {
    brand: string
  }
}
```

### Elevation, gradients and neon

```ts
Card({ elevation: 2, shadowColor: "black" }, "Raised")

Card({ gradient: { from: "#3369ff", to: "#7c5cff", direction: "horizontal" } }, "Gradient")

Button({ neon: { color: "cyan", intensity: 1.2, glow: 0.8, padding: 12 } }, "Neon")
Button({ neon: true }, "Theme color")
Button({ neon: { effects: false } }, "Plain outline")
```

`effects: false` gives a plain outline instead of the glow; software rendering
falls back to the outline automatically.

### Responsive layout

```ts
const bp = createBreakpoints(app)

app.window("main").render(() => {
  const wide = bp.atLeast("medium")

  return wide
    ? Row({ fill: true }, NavigationRail({ items, index, onChange }), page())
    : Column({ fill: true }, page(), NavBar({ items, value, onChange }))
})
```

`bp.current()` reads the current breakpoint. `Store.breakpoint` mirrors it, and
`window-resize` fires on desktop resize and Android rotation or split screen.

## Recipes

### Settings form

```ts
const field = (key: string, placeholder: string) =>
  Input({
    placeholder,
    value: bind(() => String(app.store.get(key) ?? "")),
    onInput: (value) => app.store.set(key, value),
    expand: true,
  })

Card(
  { padding: 16, gap: 12 },
  Text({ weight: "medium" }, "Profile"),
  field("name", "Name"),
  field("email", "Email"),
  Switch({
    label: "Email notifications",
    checked: bind(() => app.store.get("notify") === true),
    onToggle: (value) => app.store.set("notify", value),
  }),
  Button({ enabled: valid(), onClick: save }, "Save"),
)
```

### Search with loading, empty and error states

```ts
Column(
  { fill: true, gap: 12, padding: 16 },
  SearchField({ placeholder: "Search", onInput: runSearch }),
  When({
    test: () => app.store.get("searching") === true,
    then: () => Spinner({ size: 24 }),
    else: () =>
      When({
        test: () => String(app.store.get("error")) !== "",
        then: () => EmptyState({ icon: "error", title: "Search failed", text: String(app.store.get("error")) }),
        else: () =>
          When({
            test: () => results().length === 0,
            then: () => EmptyState({ title: "No matches" }),
            else: () => For({ each: results(), keyOf: (item) => item.id, render: resultRow }),
          }),
      }),
  }),
)
```

Deeply nested `When` is hard to read. Extract each branch into a function once
it grows.

### Confirm a destructive action

```ts
Modal(
  {
    open: bind(() => app.store.get("confirmDelete") === true),
    title: "Delete task?",
    dismissible: true,
    onClose: () => app.store.set("confirmDelete", false),
  },
  Text("This cannot be undone."),
  Row(
    { gap: 8, fillWidth: true },
    Spacer({ fillWidth: true }),
    Button({ variant: "ghost", onClick: cancel }, "Cancel"),
    Button({ color: "red", onClick: remove }, "Delete"),
  ),
)
```

### Which overlay should I use?

- **Modal** — blocking decision or short form on desktop.
- **BottomSheet** — the same on a phone, with a drag handle.
- **Popover** — a small floating panel anchored to a point.
- **Menu** — a list of actions; supports shortcuts and danger items.
- **Snackbar** — a transient confirmation, never a required decision.

## Cheat sheet

| Component        | Key props                                              | Main events                        |
| ---------------- | ------------------------------------------------------ | ---------------------------------- |
| `Column`/`Row`   | `gap`, `padding`, `fill`, `fillWidth`, `align`         | —                                  |
| `Card`/`Box`     | `padding`, `radius`, `elevation`, `gradient`, `border` | `onLongPress`                      |
| `KeepAlive`      | `active`; content is a function                        | —            |
| `Scroll`         | `fill`, `gap`, `padding`, `overscroll`, `flick`        | —                                  |
| `Text`           | `size`, `weight`, `color`, `markdown`, `elide`         | —                                  |
| `Button`         | `variant`, `size`, `icon`, `badge`, `enabled`          | `onClick`, `onLongPress`           |
| `IconButton`     | `icon`, `size`, `color`, `badge`                       | `onClick`                          |
| `Input`          | `value`, `placeholder`, `password`, `keyboardType`     | `onInput`, `onSubmitted`           |
| `SearchField`    | `debounce`, `value`, `placeholder`                     | `onInput`, `onSubmit`, `onClear`   |
| `Checkbox`       | `checked`, `label`                                     | `onToggle`                         |
| `Switch`         | `checked`, `label`                                     | `onToggle`                         |
| `RadioGroup`     | `options`, `value`, `direction`                        | `onChange`                         |
| `Slider`         | `min`, `max`, `value`                                  | `onChange`                         |
| `RangeSlider`    | `min`, `max`, `from`, `to`, `step`                     | `onChange(from, to)`               |
| `Select`         | `options`, `value`                                     | `onChange`                         |
| `Segmented`      | `items`, `value`                                       | `onChange`                         |
| `Tabs`           | `items`, `index`                                       | `onChange`                         |
| `Pager`          | `index`, `interactive`                                 | `onPageChange`                     |
| `NavBar`         | `items`, `value`, `activeColor`, `showLabels`          | `onChange`                         |
| `NavigationRail` | `items`, `index`, `expanded`, `padding`                | `onChange`                         |
| `Modal`/`Sheet`  | `open`, `title`, `dismissible`, `duration`             | `onClose`                          |
| `Menu`           | `open`, `items`                                        | `onSelect(id)`, `onClose`          |
| `Snackbar`       | `open`, `text`, `actionLabel`, `duration`              | `onAction`, `onClose`              |
| `For`            | `each`, `keyOf`, `render`, `spacing`                   | —                                  |
| `VirtualList`    | `items`, `selectable`, `refreshable`, `swipeActions`   | `onPress`, `onSelect`, `onRefresh` |

## Accessibility

Set `a11yLabel` on icon-only controls and `a11yHint` when the label alone is not
enough:

```ts
IconButton({ icon: "delete", a11yLabel: "Delete task", a11yHint: "This cannot be undone", onClick: remove })
```

Keep interactive targets large enough, do not encode meaning in color alone,
and make sure dialogs have a visible title and a close path.
