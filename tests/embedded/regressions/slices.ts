import { App, Box, Column, For, Scroll, Text, createScrollController } from "../../../core/sdk/index.ts"

type Line = {
  key: string
  text: string
  visible: boolean
}

const app = new App()
const controller = createScrollController()

const line = (key: string, text = key, visible = true): Line => {
  return { key, text, visible }
}

// Long enough that the host is still building the list in slices when the second list arrives.
const head = Array.from({ length: 100 }, (_, index) => line(`b${index}`))
const tail = Array.from({ length: 12 }, (_, index) => line(`r${index}`))

// Every kind of change, made to rows the host has not built yet: text, visibility, remove, insert, move.
const changed = [
  ...tail.slice(0, 6),
  line("r6", "r6", false),
  line("r7", "seven"),
  line("r9"),
  line("n1"),
  line("r11"),
  line("r10"),
]

app.store.set("lines", [...head, ...tail])

app.window("main").render(() => {
  const lines = app.store.get("lines") as Line[]

  return Column(
    { key: "root", fill: true },
    Scroll(
      { key: "scroll", fill: true, gap: 0, controller },
      For({
        key: "list",
        each: lines,
        keyOf: (item) => item.key,
        render: (item) =>
          Box(
            {
              height: 20,
              fillWidth: true,
              visible: item.visible,
              color: "#222222",
              onClick: () => console.log(`CLICK ${item.key}`),
            },
            Text({ text: item.text, size: 12 }),
          ),
      }),
    ),
  )
})

setTimeout(() => app.store.set("lines", [...head, ...changed]), 20)
setTimeout(() => controller.scrollToEnd(), 1500)
