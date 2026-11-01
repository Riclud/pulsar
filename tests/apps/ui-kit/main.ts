import {
  App,
  Box,
  Column,
  Header,
  Input,
  Pager,
  Popover,
  Row,
  Segmented,
  Snackbar,
  Tabs,
  ui,
  Zoomable,
} from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("page", 0)
app.store.set("tab", 0)
app.store.set("segment", 0)
app.store.set("text", "")

app.window("main").render(() =>
  Column(
    { fill: true, padding: 8, gap: 8 },
    Header({ title: "UI Kit", subtitle: "extended primitives" }),
    Tabs(
      {
        items: ["One", "Two"],
        index: 0,
        onChange: (index) => app.store.set("tab", index),
      },
      Column({ padding: 8 }, ui.text("First page")),
      Column({ padding: 8 }, ui.text("Second page")),
    ),
    Segmented({
      items: ["A", "B"],
      value: 0,
      onChange: (index) => app.store.set("segment", index),
    }),
    Pager(
      {
        index: 0,
        height: 96,
        onPageChange: (index) => app.store.set("page", index),
      },
      Box({ color: "#eeeeee", padding: 8 }, ui.text("page one")),
      Box({ color: "#dddddd", padding: 8 }, ui.text("page two")),
    ),
    Row(
      { gap: 8, fillWidth: true },
      Input({ placeholder: "name", onInput: (value) => app.store.set("text", value) }),
      Input({ placeholder: "password", password: true }),
    ),
    Input({ placeholder: "notes", multiline: true, lines: 3 }),
    ui.text({ text: "**bold** and *italic*", markdown: true, selectable: true }),
    ui.text({ text: "a very long line that should elide", elide: "right", width: 140 }),
    ui.button("Hold me", { tooltip: "long press", onLongPress: () => {}, onClick: () => {} }),
    Zoomable({ height: 120 }, Box({ color: "#cccccc", padding: 8 }, ui.text("zoom me"))),
    Snackbar({ open: false, text: "saved", onClose: () => {} }),
    Popover({ open: false }, ui.button("action", { onClick: () => {} })),
  ),
)

app.run()
