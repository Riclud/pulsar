import { App, Box, Column, For, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()
const steps = [
  ["a", "b", "c"],
  ["x", "a", "b", "c"],
  ["x", "a", "c"],
  ["c", "x", "a"],
  ["c", "x", "a", "y"],
]

const rowsAt = new Map<string, number>()
const shellAt = new Map<string, number>()

app.store.set("keys", steps[0])

const track =
  (target: Map<string, number>, key: string) =>
  ({ y }: { y: number }) => {
    target.set(key, Math.round(y))
  }

const order = (target: Map<string, number>, keys: string[]) => {
  return keys
    .map((key) => [key, target.get(key) ?? -1] as const)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key)
    .join("")
}

app.window("main").render(() => {
  const keys = app.store.get("keys") as string[]

  return Column(
    { key: "root", fillWidth: true },
    Column(
      { key: "listBox", height: 100, fillWidth: true },
      For({
        key: "list",
        each: keys,
        keyOf: (key) => key,
        memo: true,
        render: (key) => Row({ height: 20, onLayout: track(rowsAt, key) }, Text({ text: key })),
      }),
    ),
    Box(
      { key: "shell", height: 100, width: 200, color: "#222", hover: { color: "#333" } },
      ...keys.map((key) => Row({ key, height: 20, onLayout: track(shellAt, key) }, Text({ text: key }))),
    ),
  )
})

steps.slice(1).forEach((keys, step) => {
  setTimeout(() => app.store.set("keys", keys), 300 * (step + 1))
})

steps.forEach((keys, step) => {
  setTimeout(
    () => {
      console.log(`ORDER ${step} list ${order(rowsAt, keys)} shell ${order(shellAt, keys)}`)
    },
    300 * step + 200,
  )
})
