import { KNOWN_PROPS } from "./known-props.ts"

declare global {
  // Set by the dev bundle before the app loads.
  var __PULSAR_DEV: boolean | undefined
}

const COMPONENT_NAMES: Readonly<Record<string, string>> = {
  appBar: "Header",
  navRail: "NavigationRail",
  selectableText: "Text",
  textInput: "Input",
}

// Props people reach for by another name.
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  text: ["label", "title", "value"],
  title: ["label", "text"],
  label: ["text", "title"],
  caption: ["label", "text"],
  background: ["color", "fill"],
  bg: ["color", "fill"],
  backgroundColor: ["color"],
  size: ["width", "height"],
  onPress: ["onClick"],
  disabled: ["enabled"],
  onChange: ["onInput"],
}

const warned = new Set<string>()

let devMode: boolean | undefined

const isDev = (): boolean => {
  if (devMode !== undefined) return devMode

  const env = typeof process === "undefined" ? undefined : process.env

  devMode = globalThis.__PULSAR_DEV === true || env?.PULSAR_WATCH === "1"

  return devMode
}

const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i++) {
    const next = [i]

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase() ? 0 : 1

      next.push(Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + cost))
    }

    row = next
  }

  return row[b.length]!
}

const suggest = (prop: string, known: readonly string[]): string | undefined => {
  const synonym = SYNONYMS[prop]?.find((name) => known.includes(name))

  if (synonym) return synonym

  const limit = prop.length <= 4 ? 1 : 2
  let best: string | undefined
  let bestDistance = limit + 1

  for (const name of known) {
    const gap = distance(prop, name)

    if (gap >= bestDistance) continue

    best = name
    bestDistance = gap
  }

  return best
}

// `on` and a capital letter: the same test as /^on[A-Z]/, without running a regular expression per prop.
const isHandler = (prop: string): boolean => {
  if (prop.charCodeAt(0) !== 111 || prop.charCodeAt(1) !== 110) return false

  const third = prop.charCodeAt(2)

  return third >= 65 && third <= 90
}

const knownSets = new Map<string, Set<string>>()

const knownSet = (type: string, known: readonly string[]): Set<string> => {
  const cached = knownSets.get(type)

  if (cached) return cached

  const made = new Set(known)

  knownSets.set(type, made)

  return made
}

/** Dev builds only: says once per component and prop that a prop is not one the component reads. */
export const warnUnknownProps = (type: string, props: object): void => {
  if (!isDev()) return

  const known = KNOWN_PROPS[type]

  if (!known) return

  const names = knownSet(type, known)

  for (const prop in props) {
    if (names.has(prop) || prop === "children" || isHandler(prop)) continue

    const id = `${type}.${prop}`

    if (warned.has(id)) continue

    warned.add(id)

    const name = COMPONENT_NAMES[type] ?? `${type[0]!.toUpperCase()}${type.slice(1)}`
    const guess = suggest(prop, known)

    console.warn(`[pulsar] ${name}: unknown prop \`${prop}\`${guess ? `; did you mean \`${guess}\`?` : ""}`)
  }
}

/** For tests: forget what was warned and read the dev flag again. */
export const resetUnknownPropWarnings = (): void => {
  warned.clear()
  devMode = undefined
}
