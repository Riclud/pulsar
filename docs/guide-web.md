# Coming from the web

You know `div`, flexbox and React or something like it. This page explains
Pulsar in those terms: what each building block is, how to think about layout,
and how to build a real screen step by step.

## What is different

Pulsar has no HTML, no DOM and no CSS. You call TypeScript functions that
describe a tree, and a native Qt renderer draws it.

| On the web              | In Pulsar                                                  |
| ----------------------- | ---------------------------------------------------------- |
| HTML elements           | Functions: `Box(...)`, `Text(...)`                         |
| `class` and CSS rules   | Props on each node, plus ordinary JS objects to share them |
| Browser renders the DOM | Qt renders natively, there is no Chromium                  |
| `useState`              | `signal()`, or `app.store` for app-wide data               |
| React component         | `component()`                                              |
| `fetch`, `localStorage` | `net.fetch`, `storage`                                     |

Every call has the same shape: props first, then children.

```ts
Box({ padding: 16, color: "#222" }, Text({ text: "Hello" }))
```

```html
<div style="padding: 16px; background: #222"><span>Hello</span></div>
```

Sizes are plain numbers in logical pixels. There are no units, `rem` or
percentages.

## The building blocks

### Box is your div

`Box` is the plain container: it has a background, corners, a border and
padding. Reach for it when you would write a styled `div`.

```ts
Box({ color: "#222", radius: 12, padding: 16, borderWidth: 1, borderColor: "#444" }, Text({ text: "A panel" }))
```

Its children stack vertically. To lay them out in a line, put a `Row` inside, or
use a `Row` directly, because it accepts the same background props.

### Row and Column are flexbox

`Row` is `display: flex`. `Column` is `display: flex; flex-direction: column`.
They are what you will use most.

```ts
Row(
  { gap: 12, alignItems: "center", justify: "between", fillWidth: true },
  Text({ text: "Title" }),
  Button({ label: "Save" }),
)
```

```css
display: flex;
gap: 12px;
align-items: center;
justify-content: space-between;
width: 100%;
```

`Row`, `Column`, `Wrap` and `Stack` accept every `Box` surface prop too, so
`Row({ color: "#222", radius: 12 })` works like a styled flex `div`.

### Stack is position: relative

`Stack` puts its children on top of each other. It is the only container where
`absolute` works: a badge on an avatar or a button over an image.

```ts
Stack(
  { width: 48, height: 48 },
  Image({ src: "avatar.png", width: 48, height: 48 }),
  Box({
    absolute: { top: 0, right: 0 },
    width: 12,
    height: 12,
    radius: 6,
    color: "#2ecc71",
  }),
)
```

### Text is the only way to show text

You cannot put a bare string into a `Box`. Text always goes through `Text`, and
each `Text` styles itself: there is no inheritance from a parent, and no cascade.

```ts
Text({ text: "Title", size: 20, weight: "semibold", color: "#fff" })
Text({ size: 14 }, "The text can also be a child")
```

Long text does not wrap unless you ask for it:

```ts
Text({ text: longText, wrap: true, fillWidth: true })
Text({ text: longText, maxLines: 2, elide: "right", fillWidth: true })
```

### Controls are ready-made

You do not style a `button` or an `input` from scratch. They already have hover,
focus and pressed states, and they follow the theme.

| HTML                    | Pulsar                          |
| ----------------------- | ------------------------------- |
| `<button>`              | `Button`, `IconButton`          |
| `<input>`               | `Input`                         |
| `<textarea>`            | `TextArea`                      |
| `<input type=search>`   | `SearchField`                   |
| `<input type=checkbox>` | `Checkbox`, `Switch`            |
| `<select>`              | `Select`, `Segmented`           |
| `<input type=range>`    | `Slider`                        |
| `<img>`                 | `Image`, `Avatar`               |
| `<dialog>`              | `Modal`, `Sheet`, `BottomSheet` |

Events use web names: `onClick`, `onInput`, `onChange`. They receive the value
itself, not an event object.

```ts
Input({ value: name.get(), onInput: (value) => name.set(value) })
```

### Page and Scroll

The window does not scroll by itself. Content taller than the window needs
`Scroll`, or `Page`, which is a screen with a scrolling body and an optional
header and footer that stay in place.

```ts
Page({ padding: 16, gap: 12, header: Text({ text: "Tasks", size: 24 }) }, Text({ text: "This part scrolls" }))
```

## Layout, from CSS

Most flexbox habits carry over.

| CSS                              | Pulsar                              |
| -------------------------------- | ----------------------------------- |
| `gap: 12px`                      | `gap: 12`                           |
| `padding: 8px 16px`              | `paddingY: 8, paddingX: 16`         |
| `padding-left: 8px`              | `paddingLeft: 8`                    |
| `justify-content: space-between` | `justify: "between"`                |
| `align-items: center`            | `alignItems: "center"`              |
| `flex: 1`                        | `flex: 1`                           |
| `width: 100%`                    | `fillWidth: true`                   |
| `height: 100%`                   | `fillHeight: true`                  |
| `min-height: 48px`               | `minHeight: 48`                     |
| `max-width: 600px`               | `maxWidth: 600`                     |
| `overflow: hidden`               | `clip: true`                        |
| `position: absolute; top: 8px`   | `absolute: { top: 8 }` in a `Stack` |
| `z-index: 2`                     | `zIndex: 2`                         |
| `opacity: 0.5`                   | `opacity: 0.5`                      |
| `border-radius: 12px`            | `radius: 12`                        |
| `box-shadow`                     | `elevation: 2`, `shadowColor`       |
| `display: none`                  | `visible: false`, or a ternary      |
| `display: grid`                  | `Grid({ columns: 3 })`              |
| `flex-wrap: wrap`                | `Wrap`                              |
| `@media (min-width: ...)`        | `createBreakpoints(app)`            |

### There is no margin

Space between siblings comes from the parent's `gap`. For one-off space, use
padding on a wrapping `Box` or a `Spacer`.

```ts
Column({ gap: 12 }, First(), Second())
Row({}, Text({ text: "Left" }), Spacer({ fillWidth: true }), Text({ text: "Right" }))
```

### Sharing styles

There are no classes. A style is an object, and a reusable piece is a function:

```ts
const panel = { color: "#222", radius: 12, padding: 16 }

Box(panel, Text({ text: "One" }))
Box({ ...panel, color: "#333" }, Text({ text: "Two" }))
```

### How wide is my Row?

This is the one surprise for web developers. A `div` fills its parent, but a
`Row` or `Column` is **as wide as its content**, unless you say otherwise:

- `fillWidth: true` asks the parent for the available width;
- `alignItems`, `justify` or a child with `flex` make that width take effect;
- `Card`, `Scroll` and `Input` already fill the width by default.

If a `justify` or a centered child seems to do nothing, its parent is probably
narrower than you think.

## Build a screen, step by step

Here is a contact card, built the way you would build it on the web.

**1. The outer panel.** A `Row` with a background is a styled flex `div`.

```ts
Row(
  { color: "#222", radius: 12, padding: 12, gap: 12, alignItems: "center", fillWidth: true },
  // children go here
)
```

**2. The avatar.** A fixed-size round `Box`.

```ts
Box({ width: 48, height: 48, radius: 24, color: "#8b9dff" })
```

**3. The text column.** `flex: 1` takes all the remaining width, like on the web.

```ts
Column(
  { flex: 1, gap: 2 },
  Text({ text: "Anna", color: "#fff", weight: "semibold" }),
  Text({ text: "Online", size: 12, color: "#aaa", maxLines: 1, elide: "right", fillWidth: true }),
)
```

**4. The action.** Controls are ready to use.

```ts
Button({ label: "Open", onClick: open })
```

**5. Make it a component**, so it can take props and be reused:

```ts
const Contact = component<{ key: string; name: string; status: string }>((props) => {
  return Row(
    { color: "#222", radius: 12, padding: 12, gap: 12, alignItems: "center", fillWidth: true },
    Box({ width: 48, height: 48, radius: 24, color: "#8b9dff" }),
    Column(
      { flex: 1, gap: 2 },
      Text({ text: props.name, color: "#fff", weight: "semibold" }),
      Text({ text: props.status, size: 12, color: "#aaa" }),
    ),
    Button({ label: "Open" }),
  )
})
```

**6. Render a list.** Spread the rows into a `Column`, with a `key` on each, like
`key` in React:

```ts
Column(
  { gap: 8, fillWidth: true },
  ...people.map((person) => {
    return Contact({ key: person.id, name: person.name, status: person.status })
  }),
)
```

## JSX

If you prefer tags, write the screen in a `.tsx` file. New projects are already set
up for it. An existing project needs two lines in `compilerOptions`:

```json
"jsx": "react-jsx",
"jsxImportSource": "pulsar"
```

JSX compiles to the same function calls, so there is nothing new to learn:

```tsx
const Contact = component<{ key: string; name: string }>((props) => {
  return (
    <Row color="surface" radius={12} padding={12} gap={12} alignItems="center" fillWidth>
      <Avatar name={props.name} />
      <Text flex={1} weight="semibold">
        {props.name}
      </Text>
      <Button onClick={open}>Open</Button>
    </Row>
  )
})
```

Use `.tsx` for screens with a lot of layout and `.ts` for logic and state. They
import each other freely, because a component is one function either way:

```ts
// main.ts
import { TasksScreen } from "./TasksScreen.tsx"

app.window().render(() => TasksScreen({ title: "Tasks" }))
```

```tsx
// TasksScreen.tsx
import { TaskRow } from "./task-row.ts"

export const TasksScreen = component<{ title: string }>((props) => {
  return (
    <Column fill gap={8} padding={16}>
      <Text size={24}>{props.title}</Text>
      {state.tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </Column>
  )
})
```

The differences from React:

- There are no HTML tags. `<div>` is an error; use `<Box>`.
- Props are Pulsar props: `color` and `gap`, not `className` or `style`.
- Text goes inside `<Text>`. Text placed directly in `<Column>` is ignored with a
  warning.
- `{show && <Text>...</Text>}`, `items.map(...)` and `<>...</>` work as usual.
- Children arrive as arguments after `props`, not in `props.children`:
  `component((props, ...children) => ...)`.

## State, from React

The closest thing to `useState` is `signal`. The difference is that the setup
function runs **once**, and only the function it returns runs again:

```tsx
// React
const Counter = () => {
  const [count, setCount] = useState(0)

  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

```ts
// Pulsar
const Counter = component(() => {
  const count = signal(0)

  return () => {
    return Button({
      label: String(count.get()),
      onClick: () => count.set(count.peek() + 1),
    })
  }
})
```

There are no hook rules and no dependency arrays: whatever a render reads through
`.get()` is tracked. Read more in [Components and signals](../components/).

## What to do instead

| You want                 | Use                                                 |
| ------------------------ | --------------------------------------------------- |
| `:hover` color           | `hoverColor` on `Box`, `Card` and layouts           |
| `:active` scale          | `pressed: { scale: 0.98 }`                          |
| `transition`, keyframes  | `enter`, `exit`, `transition`                       |
| Swipe or drag            | `drag: { axis: "x", onRelease }`                    |
| A long list              | `VirtualList`                                       |
| `localStorage`           | `storage`                                           |
| Storing a token          | `secureStorage`                                     |
| CSS variables and themes | `defineTheme`, and theme colors such as `"surface"` |
| Custom drawing           | `Qml({ source })` with a QML component              |

Not every CSS feature has an equivalent. There is no selector cascade, no
percentage size, no `transform` prop and no `canvas` node yet. Animated colors
and states such as `:focus` on your own containers are not available either.

## Next

- [Build an app](../) — a complete task app, from an empty project.
- [Components and signals](../components/) — state, props and lifecycle.
- [UI building blocks](../../ui/) — every component and prop.
