import { App, Box, Card, Column, Row, Text } from "../../../core/sdk/index.ts"

const app = new App()

const english =
  "The quick brown fox jumps over the lazy dog and keeps running through the long green field until the evening comes."
const russian =
  "Съешь ещё этих мягких французских булок, да выпей же чаю, и продолжай читать длинный текст, который не помещается в строку."

const report = (name: string) => {
  return ({ width, height, x, y }: { width: number; height: number; x: number; y: number }) => {
    console.log(`TW ${name} ${Math.round(width)} ${Math.round(height)} ${Math.round(x)} ${Math.round(y)}`)
  }
}

type Props = Record<string, unknown>

// A text with a handler is drawn by QML, a plain one natively and cannot report its own size. So a native
// case ends with a thin probe (a box with a handler) whose y is the height of what came before it and whose
// width is the width of the column around it. A QML case reports the text itself.
const cases = (prefix: string, native: boolean) => {
  const at = (name: string) => `${prefix}${name}`
  const probe = (name: string) => {
    return Box({ key: at(`${name}-probe`), height: 4, fillWidth: true, onLayout: report(at(`${name}-probe`)) })
  }
  const text = (name: string, props: Props) => {
    return Text(native ? { key: at(name), ...props } : { key: at(name), onLayout: report(at(name)), ...props })
  }
  const one = (name: string, props: Props) => {
    return Column({ key: at(`${name}-col`) }, text(name, props), ...(native ? [probe(name)] : []))
  }

  return [
    one("en", { text: english }),
    one("ru", { text: russian }),
    one("elide", { text: english, elide: "right" }),
    one("lines", { text: english, maxLines: 2 }),
    one("short", { text: "Short" }),
    one("centerLong", { text: english, align: "center" }),
    Column(
      { key: at("center-col"), fillWidth: true },
      text("center", { text: "Centred", align: "center" }),
      text("right", { text: "Right", align: "right" }),
    ),
    // A row: the text takes what the two 40 px boxes leave and the boxes stay in the window.
    Column(
      { key: at("row-col") },
      Row(
        { key: at("row"), gap: 8 },
        Box({ key: at("left"), width: 40, height: 20, color: "#345", onLayout: report(at("left")) }),
        text("inRow", { text: russian }),
        Box({ key: at("end"), width: 40, height: 20, color: "#345", onLayout: report(at("end")) }),
      ),
      probe("row"),
    ),
    // Two texts in a row split the width.
    Column(
      { key: at("pair-col") },
      Row({ key: at("pair"), gap: 8 }, text("a", { text: english }), text("b", { text: russian })),
      probe("pair"),
    ),
    // A parent that hugs its child, and a card.
    Column(
      { key: at("hug-col") },
      Box({ key: at("hug"), color: "#432", padding: 8 }, text("inHug", { text: english })),
      probe("hug"),
    ),
    Column({ key: at("card-col") }, Card({ key: at("card") }, text("inCard", { text: russian })), probe("card")),
  ]
}

app.window("main").render(() => {
  return Column(
    { key: "root", fillWidth: true },
    Column({ key: "native" }, ...cases("n-", true)),
    // The handler makes this whole column QML.
    Column({ key: "qml", onLayout: report("qml") }, ...cases("q-", false)),
    // A single line holds a QML layout at its own width, so it goes outside the one above.
    Column({ key: "lines" }, Text({ key: "q-nowrap", text: english, wrap: false, onLayout: report("q-nowrap") })),
    Column(
      { key: "nlines" },
      Text({ key: "n-nowrap", text: english, wrap: false }),
      Box({ key: "n-nowrap-probe", height: 4, fillWidth: true, onLayout: report("n-nowrap-probe") }),
    ),
  )
})
