import { App, Box, Column, Input, Row, Text, component, signal } from "../../../core/sdk/index.ts"

const app = new App()
const query = signal("")
const names = ["alpha", "beta", "gamma", "zzz"]

// Every key in the search renders every row again, and almost all of each row comes out the same.
// The row's closures read `search`, so a click or a typed letter shows whether they are the newest ones.
const Line = component<{ key: string; name: string; search: string; visible: boolean }>((props) => {
  const count = signal(0)
  const note = signal("")

  return () => {
    const { name, search, visible } = props

    return Box(
      { visible, height: 40, fillWidth: true, color: "#222222", hover: { color: "#333333" } },
      Row(
        { gap: 0, alignItems: "center" },
        Text({ text: `${name} n=${count.get()}`, width: 80, size: 12, wrap: false }),
        Box(
          {
            key: "plus",
            width: 60,
            height: 30,
            color: "#444444",
            pressed: { color: "#555555", scale: 0.95 },
            onClick: () => {
              count.set(count.get() + 1)
              console.log(`PLUS ${name} n=${count.get()} q=${search}`)
            },
          },
          Text({ text: `+${name}`, size: 12 }),
        ),
        Input({
          key: "note",
          width: 120,
          height: 32,
          value: note.get(),
          onInput: (value) => {
            note.set(value)
            console.log(`NOTE ${name} ${value} q=${search}`)
          },
        }),
      ),
    )
  }
})

app.window("main").render(() => {
  const search = query.get()

  return Column(
    { key: "root", fill: true, gap: 0 },
    Row(
      { key: "bar", gap: 0, height: 40 },
      Input({
        key: "search",
        width: 200,
        height: 36,
        value: search,
        focus: true,
        onInput: (value) => query.set(value),
      }),
      Box(
        { key: "clear", width: 80, height: 30, color: "#444444", onClick: () => query.set("") },
        Text({ text: "clear" }),
      ),
    ),
    Column(
      { key: "list", gap: 0, fillWidth: true },
      ...names.map((name) => Line({ key: name, name, search, visible: name.includes(search) })),
    ),
  )
})
