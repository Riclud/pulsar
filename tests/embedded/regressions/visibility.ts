import { App, Box, Column, Scroll, createScrollController } from "../../../core/sdk/index.ts"

const app = new App()
const scroll = createScrollController()

app.window("main").render(() => {
  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 300, height: 300 },
      Scroll(
        { key: "scroll", fill: true, gap: 0, controller: scroll },
        Column(
          { key: "rows", gap: 0, fillWidth: true },
          ...Array.from({ length: 60 }, (_, index) => {
            return Box({
              key: `row${index}`,
              height: 30,
            fillWidth: true,
              color: "#234",
              onEnterViewport: () => console.log(`ENTER ${index}`),
              onLeaveViewport: () => console.log(`LEAVE ${index}`),
              onVisible: (visible) => console.log(`VISIBLE ${index} ${visible}`),
            })
          }),
        ),
      ),
    ),
  )
})

setTimeout(() => scroll.scrollTo(600), 700)
