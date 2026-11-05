import { App, Box, Column, Input, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("step", 0)

const reportWidth = ({ width }: { width: number }) => {
  console.log(`SIZE flexed ${Math.round(width)}`)
}

app.window("main").render(() => {
  const step = Number(app.store.get("step"))

  return Column(
    { key: "root" },
    Box(
      { key: "frame", width: 400, height: 400 },
      Row(
        { key: "bar", fillWidth: true, height: 10 },
        Box({ key: "kept", flex: 1, height: 10, onLayout: reportWidth }),
        step === 0 ? Box({ key: "gone", flex: 1, height: 10 }) : null,
      ),
      step > 0 ? Text({ key: "inserted", text: "inserted" }) : null,
      Row(
        { key: "field" },
        Input({
          focus: true,
          onFocus: () => console.log("FIELD focus"),
          onBlur: () => console.log("FIELD blur"),
        }),
      ),
    ),
  )
})

setTimeout(() => app.store.set("step", 1), 300)
