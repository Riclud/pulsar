import { App, Box, Column, Menu, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("menu", null)

app.window("main").render(() => {
  const at = app.store.get("menu") as { x: number; y: number } | null

  return Column(
    { key: "root" },
    Box(
      {
        key: "target",
        width: 200,
        height: 100,
        color: "#234",
        onContextMenu: ({ x, y }) => {
          console.log(`CONTEXT ${Math.round(x)} ${Math.round(y)}`)
          app.store.set("menu", { x, y })
        },
      },
      Text({ text: "right click me" }),
    ),
    Menu({
      key: "menu",
      open: at !== null,
      x: at?.x ?? 0,
      y: at?.y ?? 0,
      items: [{ id: "copy", label: "Copy" }],
      onSelect: (id) => console.log(`SELECT ${id}`),
      onClose: () => app.store.set("menu", null),
    }),
  )
})
