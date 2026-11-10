import { App, Box, Text, VirtualList, createScrollController } from "../../../core/sdk/index.ts"

const app = new App()
const scroll = createScrollController()

const items = Array.from({ length: 1000 }, (_, index) => ({ id: `row${index}`, label: `Item ${index}` }))

let rendered = 0
let lowest = Infinity
let highest = -1

app.window("main").render(() => {
  return Box(
    { key: "frame", width: 300, height: 300 },
    VirtualList({
      key: "list",
      fill: true,
      items,
      rowHeight: 30,
      controller: scroll,
      keyOf: (item) => item.id,
      render: (item, index) => {
        rendered++
        lowest = Math.min(lowest, index)
        highest = Math.max(highest, index)

        return Box(
          { key: item.id, color: "#234", onClick: () => console.log(`CLICK ${index}`) },
          Text({ text: item.label }),
        )
      },
    }),
  )
})

setTimeout(() => console.log(`FIRST rendered=${rendered} highest=${highest}`), 500)

setTimeout(() => {
  rendered = 0
  lowest = Infinity
  highest = -1
  scroll.scrollTo(15000)
}, 600)

setTimeout(() => console.log(`FAR rendered=${rendered} lowest=${lowest} highest=${highest}`), 1500)
