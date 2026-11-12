import { App, Column, Input, Scroll } from "../../../core/sdk/index.ts"

const app = new App()

app.window("main").render(() => {
  return Scroll(
    {
      key: "list",
      height: 300,
      gap: 10,
      onScroll: (state) => console.log(`REVEAL offset ${Math.round(state.offset)} height ${state.height}`),
    },
    Column({ key: "top", height: 700 }),
    Input({ key: "low", height: 40, focus: true, onFocus: () => console.log("REVEAL focus low") }),
    Column({ key: "bottom", height: 200 }),
  )
})
