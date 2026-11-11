import { App, Column, Input } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("a", "")
app.store.set("b", "from-app")
app.store.set("flip", false)
app.store.set("tick", 0)

// A slow JS thread: every key has already reached the field when the first echo comes back.
const stall = (ms: number) => {
  const end = Date.now() + ms

  while (Date.now() < end) {
    // Busy on purpose.
  }
}

const field = (key: string, echo: boolean) => {
  return Input({
    key,
    height: 40,
    value: String(app.store.get(key)),
    focus: key === "a",
    onInput: (value) => {
      console.log(`INPUT ${key} ${value}`)

      // A rerender while b is typed in: its value prop is the old one.
      if (!echo) return void app.store.set("tick", Number(app.store.get("tick")) + 1)

      stall(40)
      app.store.set(key, value)
    },
    onSubmitted: (value) => {
      console.log(`SUBMIT ${key} ${value}`)

      // A rerender that moves the focused field, then a value set by the app while b has the focus.
      if (value === "hello") app.store.set("flip", true)
      if (value === "from-appx") app.store.set("b", "late")
    },
    onFocus: () => console.log(`FOCUS ${key}`),
    onBlur: () => console.log(`BLUR ${key}`),
  })
}

app.window("main").render(() => {
  app.store.get("tick")

  const fields = [field("a", true), field("b", false)]

  return Column({ key: "root", gap: 10 }, ...(app.store.get("flip") ? fields.reverse() : fields))
})
