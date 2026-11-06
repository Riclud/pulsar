// Terminal output for the CLI: one look for steps, details, warnings and errors.
// Colors turn off with NO_COLOR, when output is not a terminal, or on dumb terminals.

const colorEnabled = (): boolean => {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR) return true

  return Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb"
}

type Rgb = [number, number, number]

const ACCENT: Rgb = [127, 146, 255]
const CYAN: Rgb = [95, 227, 255]
const GREEN: Rgb = [111, 207, 151]
const YELLOW: Rgb = [242, 201, 76]
const RED: Rgb = [255, 107, 107]
const FADED: Rgb = [30, 36, 58]

const paint = (text: string, rgb: Rgb, bold = false): string => {
  if (!colorEnabled() || !text) return text

  return `\x1b[${bold ? "1;" : ""}38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[0m`
}

const dim = (text: string): string => (colorEnabled() && text ? `\x1b[2m${text}\x1b[0m` : text)
const bold = (text: string): string => (colorEnabled() && text ? `\x1b[1m${text}\x1b[0m` : text)

const mix = (from: Rgb, to: Rgb, t: number): Rgb => {
  return [0, 1, 2].map((i) => Math.round(from[i]! + (to[i]! - from[i]!) * t)) as Rgb
}

/** Colors each character along a gradient, leaving spaces alone. */
const gradient = (text: string, from: Rgb, to: Rgb, strong = false): string => {
  if (!colorEnabled()) return text

  const chars = [...text]

  return chars
    .map((char, index) =>
      char === " " ? char : paint(char, mix(from, to, index / Math.max(1, chars.length - 1)), strong),
    )
    .join("")
}

const PULSAR = [
  "              ·        ✦            ·",
  "      ✦          .-~~~~~-.             ·",
  "  ━━━━━━━━━━━━━━(    ◉    )━━━━━━━━━━━━━━",
  "         ·       '-~~~~~-'       ✦",
  "               ·         ·           ·",
]

const drawPulsar = (): string[] => {
  return PULSAR.map((line, row) => {
    if (row !== 2) {
      return [...line]
        .map((char) => {
          if (char === "✦") return paint(char, CYAN)
          if (char === "·") return dim(char)
          if ("-~.'".includes(char)) return paint(char, ACCENT)

          return char
        })
        .join("")
    }

    const core = line.indexOf("(")
    const end = line.indexOf(")") + 1
    const left = line.slice(0, core)
    const right = line.slice(end)
    const ring = line.slice(core, end).replace("◉", "\u0000")
    const middle = ring
      .split("\u0000")
      .map((part) => paint(part, ACCENT))
      .join(paint("◉", [255, 255, 255], true))

    // The beams fade out toward the edges, like the light of a pulsar.
    return gradient(left, FADED, CYAN) + middle + gradient(right, CYAN, FADED)
  })
}

export const ui = {
  /** The start screen: the pulsar, the name and what it is. */
  banner(version: string): void {
    console.log("")
    for (const line of drawPulsar()) console.log(`  ${line}`)
    console.log("")
    console.log(`  ${gradient("pulsar", CYAN, ACCENT, true)} ${dim(version)}  ${dim("native apps in TypeScript")}`)
    console.log("")
  },

  /** A short line naming the command and what it runs on. */
  header(command: string, ...parts: string[]): void {
    const tail = parts.filter(Boolean).map((part) => dim(part))

    console.log(
      `${paint("◉", ACCENT, true)} ${bold(`pulsar ${command}`)}${tail.length ? `  ${tail.join(dim("  ·  "))}` : ""}`,
    )
  },

  step(text: string): void {
    console.log(`${paint("›", ACCENT, true)} ${text}`)
  },

  done(text: string): void {
    console.log(`${paint("✓", GREEN, true)} ${text}`)
  },

  /** An indented `label  value` line under a step. */
  detail(label: string, value: string): void {
    console.log(`  ${dim(label.padEnd(8))} ${value}`)
  },

  note(text: string): void {
    console.log(`  ${dim(text)}`)
  },

  warn(text: string): void {
    console.warn(`${paint("!", YELLOW, true)} ${text}`)
  },

  error(text: string): void {
    console.error(`${paint("✗", RED, true)} ${text}`)
  },

  /** A doctor line that starts with `ok`, `warn` or `FAIL`; the words stay for scripts. */
  status(line: string): void {
    const [word = "", ...rest] = line.split(/(?<=^\S+)/)
    const color = word === "ok" ? GREEN : word === "warn" ? YELLOW : RED

    console.log(`${paint(word, color, true)}${rest.join("")}`)
  },

  /** Highlights a command or path inside a message. */
  code(text: string): string {
    return paint(text, CYAN)
  },

  dim,
  bold,
}
