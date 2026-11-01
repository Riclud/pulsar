import {
  App,
  Box,
  Column,
  Grid,
  Header,
  Input,
  Pager,
  Popover,
  Row,
  Segmented,
  Snackbar,
  clipboard,
  device,
  permissions,
  share,
  Tabs,
  theme,
  VirtualList,
  ui,
  Zoomable,
} from "../../../core/sdk/index.ts"

const app = new App()

void clipboard.write("pulsar")
void clipboard.read()
void device.setKeepAwake(false)
void device.setOrientation("auto")
void share.text("hello from ui-kit")
void permissions.check("camera").then((granted) => app.store.set("permission", granted))
void permissions.request("camera").then((granted) => app.store.set("permissionRequest", granted))

void theme.set({
  palette: { primary: "#ff6600", radius: 14 },
  colors: { brand: "deepskyblue", ink: "#101014" },
  fontScale: 1.1,
  density: 1.1,
})

app.store.set("page", 0)
app.store.set("tab", 0)
app.store.set("segment", 0)
app.store.set("text", "")

app.window("main").render(() =>
  ui.scroll(
    { fill: true },
    Column(
    { fillWidth: true, padding: 8, gap: 8 },
    Header({
      title: "UI Kit",
      subtitle: "extended primitives",
      animate: 150,
      a11yLabel: "UI kit header",
    }),
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
    Grid(
      { columns: 2, gap: 8, height: 96, fillHeight: false },
      ui.box({ color: "tomato", padding: 8 }, ui.text({ text: "cell 1", color: "white" })),
      ui.box({ color: "gold", padding: 8 }, ui.text({ text: "cell 2", color: "black" })),
      ui.box({ color: "brand", padding: 8 }, ui.text({ text: "cell 3", color: "ink" })),
    ),
    VirtualList({
      items: [
        { key: "a", title: "Alpha", subtitle: "first", section: "A" },
        { key: "b", title: "Beta", trailing: "2", section: "A" },
        { key: "c", title: "Gamma", section: "B" },
      ],
      height: 168,
      fillHeight: false,
      selectable: true,
      stickySections: true,
      swipeActions: [{ id: "delete", icon: "delete", label: "Delete" }],
      onSelect: () => {},
      onPress: () => {},
      onAction: () => {},
      onEndReached: () => {},
      onRefresh: () => {},
      onReorder: () => {},
      reorderable: true,
      refreshable: true,
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
  ),
)

app.run()
