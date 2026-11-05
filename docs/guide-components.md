# Components and signals

Pulsar updates only what changed. A render records what it reads, and when one of
those values changes, only that render runs again. This page explains how to use
that: where state lives, how components work, and what to avoid.

## The rule

**Anything a render reads must be reactive:** a signal, `createState`, or
`app.store`. An ordinary variable is read once and never updates the screen.

```ts
let plain = 0
const count = signal(0)

app.window().render(() =>
  Column(
    {},
    Text({ text: String(plain) }), // does not update
    Text({ text: String(count.get()) }), // updates
  ),
)
```

## Where state lives

| State                               | Use           |
| ----------------------------------- | ------------- |
| Inside one component: input, toggle | `signal`      |
| Shared by the app's screens         | `createState` |
| Must reach QML or survive a reload  | `app.store`   |

### signal

```ts
const count = signal(0)

count.get() // read and subscribe
count.set(1) // write
count.peek() // read without subscribing
```

Setting the same value does nothing. Comparison is by reference, so create a new
array or object instead of changing one in place:

```ts
items.get().push(item) // the screen does not update
items.set([...items.peek(), item]) // it does
```

### computed

A value derived from others. It runs lazily and caches its result.

```ts
const open = computed(() => tasks.get().filter((task) => !task.done))

open.get()
```

### createState

A plain-looking object whose fields are signals. It is the easiest way to hold
app state, because reads and writes stay ordinary code:

```ts
export const state = createState({
  tasks: [] as Task[],
  filter: "",
})

state.filter = "open"
state.tasks = [...state.tasks, task]
```

Only assigning a top-level field is tracked. `state.tasks.push(task)` changes
nothing on screen.

### effect

Runs now and again after anything it read changes. It returns a stop function.

```ts
const stop = effect(() => {
  void storage.set("filter", state.filter)
})
```

Use `untracked(() => ...)` to read a value without subscribing.

### app.store

The store is the same idea with string keys. Each key is tracked separately, and
its values are also published to QML as `Store.<key>`, so every change crosses the
bridge. Prefer signals for UI state that only JavaScript reads.

## Components

A component is a function wrapped in `component`. There are two forms.

**Simple.** It returns a node, and the whole function runs again on a change.
This suits components with no local state.

```ts
const Title = component<{ text: string }>(({ text }) => {
  return Text({ text, size: 20, weight: "semibold" })
})
```

**With setup.** It returns a render function. The outer part runs once per
instance, so local state lives there.

```ts
const Counter = component<{ label: string }>((props) => {
  const count = signal(0)

  return () => {
    return Button({
      label: `${props.label}: ${count.get()}`,
      onClick: () => count.set(count.peek() + 1),
    })
  }
})
```

Do not create a signal in the simple form: it would be recreated on each run.

### In JSX

Every form works the same in a `.tsx` file. A component takes its props as attributes,
and children arrive as usual. See [JSX](../web/#jsx) for the setup.

```tsx
const Counter = component<{ label: string }>((props) => {
  const count = signal(0)

  return () => (
    <Button onClick={() => count.set(count.peek() + 1)}>
      {`${props.label}: ${count.get()}`}
    </Button>
  )
})

<Counter label="Taps" />
```

### Props

A component reruns when a prop changes, compared by reference. When its parent
reruns with equal props, the previous result is reused.

- **In the setup form, read through `props`.** Destructuring in the setup keeps the
  first value forever.
- **A new function does not count as a change**, so `onClick: () => ...` does not
  rerender the child. The closure is replaced only when the child rerenders, so
  anything a callback depends on should also be a prop or a signal.
- **Children** arrive as arguments, and as `props.children` in the setup form. A
  component with children reruns with every parent render.

### Keys

Give a `key` to anything rendered from a list, as in React. Without one, identity
comes from the call order, so inserting a row would give each row the state of its
neighbour.

```ts
Column({}, ...tasks.map((task) => TaskRow({ key: task.id, task })))
```

Two components with the same key produce a warning.

### Lifecycle

```ts
const Clock = component(() => {
  const now = signal(Date.now())

  onMount(() => {
    const timer = setInterval(() => now.set(Date.now()), 1000)

    return () => clearInterval(timer)
  })

  onCleanup(() => console.log("removed"))

  return () => Text({ text: new Date(now.get()).toLocaleTimeString() })
})
```

`onMount` runs after the first render has reached the host. Its returned function
and `onCleanup` run when the component leaves the tree. Both must be called during
setup.

## Keep a screen alive

Normally a screen that leaves the tree is destroyed, and opening it again builds it
from scratch. `KeepAlive` builds the content the first time it is active and only
hides it after that, so it comes back at once with its scroll position and typed text.

```ts
Stack(
  { fill: true },
  KeepAlive({ key: "list", active: !ui.calendarOpen }, () => ListScreen({})),
  KeepAlive({ key: "calendar", active: ui.calendarOpen }, () => CalendarScreen({})),
)
```

In JSX, the content is a function too:

```tsx
<KeepAlive active={ui.calendarOpen}>{() => <CalendarScreen />}</KeepAlive>
```

The content is a function so that nothing is built before the first visit. While
hidden it does not rerender: changes are recorded and applied when it is shown again,
so a hidden screen costs memory, not time. It accepts the props of `Box` and fills the
parent by default, including `enter`, `exit` and `transition` for a smooth switch. Add
`preload: true` to build the content ahead of time, so the first opening is instant as
well.

- **Effects and timers keep running.** Only rendering is paused, so stop what you do
  not need in a hidden screen.
- **State stays.** Do not use it for a form that must start empty, such as an editor
  opened for a different item. Render that one with a plain condition.
- **Removing it frees everything.** When the `KeepAlive` leaves the tree, its content
  is destroyed and `onCleanup` runs.

## Keep updates small

A render reruns as a whole, so split a screen by what changes together:

```ts
const Header = component(() => Text({ text: `Left: ${open.get().length}` }))
const List = component(() => Column({}, ...rows()))

app.window().render(() => Column({}, Header({}), List({})))
```

Now a change to one list item does not touch the header, and typing in a search
field only reruns the components that read the query.

Set `PULSAR_DEBUG=1` to log how long each update takes, or read it in code:

```ts
app.onUiTimings = ({ build, send, patches }) => console.log(build, send, patches)
```

## State outside the reactive system

If a render depends on something signals cannot see, call `app.invalidateUi()` to
rerender everything. Treat it as a last resort.

## Moving from older versions

Before this model, any store change reran the whole window.

- Replace module-level state with `createState`.
- Replace `defineComponent` with `component`.
- `store.set` now compares objects by reference, so setting an equal copy counts
  as a change.
- Replace `bind(() => value)` with `value`, since values are read while rendering.
- `memo` is gone: `component` already skips a rerender when its props are equal.
- `When` is gone: use a ternary. `AppBar` is now only `Header`, and `TextField` only
  `Input`.
- `fillWidth` and `fillHeight` always fill a `Row` or `Column`; they used to stop at
  the size of the children.
- A layout with spare space keeps its children at the start, and a tall `Box` no longer
  centers its child. Use `Column({ justify: "center", alignItems: "center" })`.
- A window has no margin of its own, so give the root node a `padding`.
- `flickVelocity` and `flickDeceleration` are gone; `overscroll` now defaults to true.
