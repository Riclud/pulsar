import { App, Box, Column, Row, Scroll, createScrollController } from "../../../core/sdk/index.ts"

const app = new App()

const native = createScrollController()
const island = createScrollController()

const rows = (prefix: string) => {
  return Array.from({ length: 40 }, (_, index) => Box({ key: `${prefix}${index}`, height: 20, color: "#234" }))
}

app.window("main").render(() => {
  return Box(
    { key: "frame", width: 300, height: 300 },
    Row(
      { key: "pair", fill: true },
      Box(
        { key: "left", width: 150, height: 300 },
        Scroll({ key: "native", fill: true, gap: 0, controller: native }, Column({ key: "a", gap: 0 }, ...rows("a"))),
      ),
      Box(
        { key: "right", width: 150, height: 300 },
        // A scroll event makes this one a QML scroll.
        Scroll(
          {
            key: "island",
            fill: true,
            gap: 0,
            controller: island,
            onScroll: ({ offset }) => console.log(`SCROLL ${Math.round(offset)}`),
          },
          Column({ key: "b", gap: 0 }, ...rows("b")),
        ),
      ),
    ),
  )
})

setTimeout(() => {
  native.scrollTo(200)
  island.scrollTo(250)
}, 400)

setTimeout(() => {
  native.scrollTo(300, { animated: true })
  island.scrollTo(310, { animated: true })
}, 800)

setTimeout(() => {
  native.scrollToEnd()
  island.scrollToStart()
}, 1800)
