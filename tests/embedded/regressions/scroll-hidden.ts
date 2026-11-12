import { App, Box, Column, Page, Text, createScrollController, createState } from "../../../core/sdk/index.ts"

const app = new App()

const scroll = createScrollController()
const view = createState({ shown: true, rows: 40 })

app.window("main").render(() => {
  return Box(
    { key: "screen", fill: true, visible: view.shown },
    Page(
      {
        controller: scroll,
        padding: 14,
        gap: 10,
        header: Text({ text: "Header" }),
      },
      Column(
        { gap: 8, fillWidth: true },
        ...Array.from({ length: view.rows }, (_, index) => {
          return Box(
            {
              key: `r${index}`,
              fillWidth: true,
              height: 40,
              color: "#234",
              onClick: () => console.log(`CLICK ${index}`),
            },
            Text({ text: `row ${index}` }),
          )
        }),
      ),
    ),
  )
})

setTimeout(() => scroll.scrollTo(300), 400)
setTimeout(() => {
  view.shown = false
}, 900)
// A change under the hidden screen makes the layout collapse the content and clamp the scroll to the top.
setTimeout(() => {
  view.rows = 41
}, 1100)
setTimeout(() => {
  view.shown = true
}, 1500)
