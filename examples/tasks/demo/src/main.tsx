import { existsSync, readFileSync, writeFileSync } from "fs"
import { App, Box, Column, Row, Text, signal, theme, type ColorValue } from "pulsar"
import { SCRIPT } from "./edits.ts"

const TARGET = process.env.DEMO_TARGET ?? ""
const START = process.env.DEMO_START ?? ""
const FONT_SIZE = 13
const LINE_HEIGHT = 17
const CHAR_WIDTH = 7.8
const CARET_WIDTH = 2
const BACKGROUND: ColorValue = "#0e0f12"
const KEYWORDS = /^(import|from|const|return|signal)$/

type Kind = "plain" | "keyword" | "string" | "number" | "tag" | "muted"

interface Token {
  text: string
  kind: Kind
}

const source = signal(readFileSync(TARGET, "utf8"))
const caret = signal(0)
const saved = signal(true)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const tokenize = (line: string): Token[] => {
  const pattern = /(\s+)|("[^"]*")|(\b\d+\b)|([A-Za-z_]\w*)|([^\sA-Za-z_"\d]+)/g
  const tokens: Token[] = []

  for (const match of line.matchAll(pattern)) {
    const text = match[0]

    if (match[2]) tokens.push({ text, kind: "string" })
    else if (match[3]) tokens.push({ text, kind: "number" })
    else if (match[4] && KEYWORDS.test(text)) tokens.push({ text, kind: "keyword" })
    else if (match[4] && /^[A-Z]/.test(text)) tokens.push({ text, kind: "tag" })
    else if (match[5]) tokens.push({ text, kind: "muted" })
    else tokens.push({ text, kind: "plain" })
  }

  return tokens
}

const colorOf = (kind: Kind, accent: ColorValue): ColorValue => {
  if (kind === "keyword" || kind === "tag") return accent
  if (kind === "string") return "#a9b1bd"
  if (kind === "number") return accent
  if (kind === "muted") return "#5c6370"

  return "#c8ccd4"
}

const accentOf = (text: string): ColorValue => {
  const found = /ACCENT = "(#[0-9a-f]{6})"/.exec(text)?.[1]

  return (found ?? "#7aa2f7") as ColorValue
}

const splitAt = (tokens: Token[], column: number): [Token[], Token[]] => {
  const left: Token[] = []
  const right: Token[] = []
  let offset = 0

  for (const token of tokens) {
    const cut = Math.max(0, Math.min(token.text.length, column - offset))

    if (cut > 0) left.push({ text: token.text.slice(0, cut), kind: token.kind })
    if (cut < token.text.length) right.push({ text: token.text.slice(cut), kind: token.kind })

    offset += token.text.length
  }

  return [left, right]
}

const renderToken = (token: Token, key: string, accent: ColorValue, trim = 0) => {
  const width = token.text.length * CHAR_WIDTH - trim

  if (!token.text.trim()) return <Box key={key} width={width} height={1} />

  return <Text key={key} text={token.text} size={FONT_SIZE} width={width} color={colorOf(token.kind, accent)} />
}

const CodeLine = (props: { index: number; line: string; column: number | null; accent: ColorValue }) => {
  const [left, right] = splitAt(tokenize(props.line), props.column ?? props.line.length)
  const caret = props.column !== null
  const parts = [
    ...left.map((token, index) =>
      renderToken(token, `a${index}`, props.accent, caret && index === left.length - 1 ? CARET_WIDTH : 0),
    ),
    ...(caret ? [<Box key="caret" width={CARET_WIDTH} height={LINE_HEIGHT} color={props.accent} />] : []),
    ...right.map((token, index) => renderToken(token, `b${index}`, props.accent)),
  ]

  return (
    <Row key={`l${props.index}`} height={LINE_HEIGHT} alignItems="center" color={caret ? "#15171c" : BACKGROUND}>
      <Text key="n" text={String(props.index + 1)} size={FONT_SIZE} width={48} align="right" color="#3b3f49" />
      <Box key="g" width={caret && left.length === 0 ? 20 - CARET_WIDTH : 20} height={1} />
      <Row key="c">{parts}</Row>
    </Row>
  )
}

void theme.set({ palette: { background: BACKGROUND, text: "#c8ccd4" } })

new App().window("main").render(() => {
  const text = source.get()
  const before = text.slice(0, caret.get()).split("\n")
  const row = before.length - 1
  const column = before[row]!.length
  const accent = accentOf(text)

  return (
    <Row key="stage" fillWidth fillHeight>
      <Column key="pane" fillWidth fillHeight>
        <Row key="bar" height={36} paddingX={24} gap={10} alignItems="center">
          <Text key="file" text="src/main.tsx" size={13} color="#7f8590" />
          <Box key="dot" width={6} height={6} radius={3} color={saved.get() ? BACKGROUND : accent} />
        </Row>
        <Column key="code">
          {text.split("\n").map((line, index) => (
            <CodeLine index={index} line={line} column={index === row ? column : null} accent={accent} />
          ))}
        </Column>
      </Column>
      <Box key="divider" width={1} fillHeight color="#1b1d23" />
    </Row>
  )
})

const replaceAt = (start: number, removed: number, inserted: string) => {
  const text = source.peek()

  source.set(text.slice(0, start) + inserted + text.slice(start + removed))
  caret.set(start + inserted.length)
}

const type = async (at: number, removed: number, inserted: string) => {
  caret.set(at + removed)
  await wait(260)

  for (let left = removed; left > 0; left -= 1) {
    replaceAt(at + left - 1, 1, "")
    await wait(34)
  }

  for (let done = 0; done < inserted.length; done += 1) {
    replaceAt(at + done, 0, inserted[done]!)
    await wait(52 + Math.random() * 40)
  }
}

const play = async () => {
  while (!existsSync(START)) await wait(50)

  await wait(1500)

  for (const group of SCRIPT) {
    for (const edit of group) {
      const at = source.peek().indexOf(edit.find)
      const common = [...edit.find].findIndex((char, index) => char !== edit.replace[index])
      const head = common < 0 ? edit.find.length : common

      saved.set(false)
      await type(at + head, edit.find.length - head, edit.replace.slice(head))
    }

    await wait(240)
    writeFileSync(TARGET, source.peek())
    saved.set(true)
    await wait(1700)
  }

  writeFileSync(`${START}.done`, "")
}

void play()
