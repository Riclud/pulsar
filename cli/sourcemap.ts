import { isAbsolute, relative, resolve } from "path"

export interface MappedLocation {
  source: string
  line: number
  column: number
}

export interface SourceMapper {
  map(line: number, column: number): MappedLocation | null
}

export interface SourceMapOptions {
  baseDir?: string
  root?: string
}

interface SourceMapV3 {
  version: number
  sources: string[]
  mappings: string
}

interface Segment {
  generatedColumn: number
  source: number
  line: number
  column: number
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

const decodeVlq = (text: string): number[] => {
  const values: number[] = []

  let value = 0
  let shift = 0

  for (const char of text) {
    const digit = BASE64.indexOf(char)

    if (digit < 0) continue

    value += (digit & 31) << shift

    if (digit & 32) {
      shift += 5
      continue
    }

    const negative = value & 1

    value >>= 1
    values.push(negative ? -value : value)

    value = 0
    shift = 0
  }

  return values
}

type Position = {
  source: number
  line: number
  column: number
}

const decodeGroup = (group: string, position: Position): Segment[] => {
  const segments: Segment[] = []

  let generatedColumn = 0

  for (const values of group.split(",").filter(Boolean).map(decodeVlq)) {
    generatedColumn += values[0] ?? 0

    if (values.length < 4) continue

    position.source += values[1]!
    position.line += values[2]!
    position.column += values[3]!

    segments.push({ generatedColumn, ...position })
  }

  return segments
}

const decodeMappings = (mappings: string): Segment[][] => {
  const position: Position = { source: 0, line: 0, column: 0 }

  return mappings.split(";").map((group) => decodeGroup(group, position))
}

const displaySource = (source: string, options?: SourceMapOptions): string => {
  const base = options?.baseDir?.replace(/\/+$/, "")

  if (!base) return source

  const absolute = isAbsolute(source) ? source : resolve(base, source)
  const root = options?.root?.replace(/\/+$/, "")

  if (root && absolute.startsWith(`${root}/`)) return relative(root, absolute)
  if (absolute.startsWith(`${base}/`)) return relative(base, absolute)

  return absolute
}

const mapperFor = (map: SourceMapV3, options?: SourceMapOptions): SourceMapper => {
  const lines = decodeMappings(map.mappings)
  const sources = map.sources.map((source) => displaySource(source, options))

  return {
    map(line, column) {
      const segments = lines[line - 1]

      if (!segments || segments.length === 0) return null

      let low = 0
      let high = segments.length - 1
      let best = segments[0]!

      while (low <= high) {
        const middle = (low + high) >> 1
        const candidate = segments[middle]!

        if (candidate.generatedColumn <= column) {
          best = candidate
          low = middle + 1
          continue
        }

        high = middle - 1
      }

      return { source: sources[best.source] ?? "", line: best.line + 1, column: best.column + 1 }
    },
  }
}

/** Parse the inline `sourceMappingURL` Bun appends to a bundle. */
export const parseInlineSourceMap = (bundle: string, options?: SourceMapOptions): SourceMapper | null => {
  const marker = "sourceMappingURL="
  const index = bundle.lastIndexOf(marker)

  if (index < 0) return null

  const end = bundle.indexOf("\n", index)
  const url = bundle.slice(index + marker.length, end < 0 ? undefined : end).trim()
  const base64 = url.indexOf("base64,")

  if (base64 < 0) return null

  try {
    const map = JSON.parse(Buffer.from(url.slice(base64 + "base64,".length), "base64").toString("utf8")) as SourceMapV3

    if (map.version !== 3 || !Array.isArray(map.sources) || typeof map.mappings !== "string") return null

    return mapperFor(map, options)
  } catch {
    return null
  }
}

/** Rewrite `runtime.js:line:column` frames to their original TypeScript source. */
export const mapErrorText = (text: string, mapper: SourceMapper | null): string => {
  if (!mapper) return text

  const withColumns = text.replace(
    /([\w./\\-]*runtime\.js):(\d+):(\d+)/g,
    (whole, _file: string, line: string, column: string) => {
      const mapped = mapper.map(Number(line), Number(column))

      return mapped ? `${mapped.source}:${mapped.line}:${mapped.column}` : whole
    },
  )

  return withColumns.replace(/([\w./\\-]*runtime\.js):(\d+)(?!:)/g, (whole, _file: string, line: string) => {
    const mapped = mapper.map(Number(line), 0)

    return mapped ? `${mapped.source}:${mapped.line}:${mapped.column}` : whole
  })
}
