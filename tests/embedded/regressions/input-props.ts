import { App, Box, Column, Input } from "../../../core/sdk/index.ts"

const app = new App()

// The password field is y 0..40, the text area starts at 50 and is 3 lines (72 px) tall to begin with.
app.window("main").render(() => {
  return Column(
    { key: "root", gap: 10 },
    Input({
      key: "pin",
      height: 40,
      focus: true,
      password: true,
      maxLength: 3,
      keyboardType: "number",
      onInput: (value) => console.log(`INPUT pin ${value}`),
    }),
    Input({
      key: "notes",
      multiline: true,
      lines: 3,
      onInput: (value) => console.log(`INPUT notes ${JSON.stringify(value)}`),
    }),
    // Sits right under the text area, so its y tells how tall the area is (the area starts at 50).
    Box({
      key: "after",
      height: 10,
      onLayout: ({ y }: { y: number }) => console.log(`SIZE after ${Math.round(y)}`),
    }),
  )
})
