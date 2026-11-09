import { App, Box, Column } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("open", true)

app.window("main").render(() => {
  const open = Boolean(app.store.get("open"))

  return Column(
    { key: "root", gap: 60 },
    Box({ key: "top", height: 40, color: "#222" }),
    Box({
      key: "middle",
      height: 40,
      color: "#333",
      visible: open,
      enter: { opacity: 0 },
      exit: { opacity: 0 },
      transition: { duration: 1500, curve: "linear" },
    }),
    Box({
      key: "last",
      height: 40,
      color: "#444",
      onLayout: ({ y }) => console.log(`LAST ${Math.round(y)}`),
    }),
  )
})

setTimeout(() => {
  console.log("PHASE hide")
  app.store.set("open", false)
}, 1500)

setTimeout(() => {
  console.log("PHASE show")
  app.store.set("open", true)
}, 3800)
