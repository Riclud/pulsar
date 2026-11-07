import { Canvas, type CanvasOptions, type UiNode } from "./ui.ts"

/**
 * A QR Code encoder (ISO/IEC 18004) for byte mode, versions 1 to 40, after
 * Project Nayuki's reference design. It runs in pure JS, so it works on QuickJS.
 */

export type QrErrorCorrection = "L" | "M" | "Q" | "H"

const ECC_INDEX: Readonly<Record<QrErrorCorrection, number>> = { L: 0, M: 1, Q: 2, H: 3 }

// Format bits of each level, in the order the standard numbers them.
const ECC_FORMAT_BITS: Readonly<Record<QrErrorCorrection, number>> = { L: 1, M: 0, Q: 3, H: 2 }

const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]

const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

const PENALTY_N1 = 3
const PENALTY_N2 = 3
const PENALTY_N3 = 40
const PENALTY_N4 = 10

const utf8 = (text: string): number[] => {
  const bytes: number[] = []

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0

    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
  }

  return bytes
}

const rawDataModules = (version: number): number => {
  let result = (16 * version + 128) * version + 64

  if (version >= 2) {
    const align = Math.floor(version / 7) + 2

    result -= (25 * align - 10) * align - 55

    if (version >= 7) result -= 36
  }

  return result
}

const dataCodewords = (version: number, ecc: QrErrorCorrection): number => {
  const level = ECC_INDEX[ecc]

  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[level]![version]! * NUM_ERROR_CORRECTION_BLOCKS[level]![version]!
  )
}

// Reed-Solomon over GF(2^8) with the polynomial 0x11D.
const multiply = (x: number, y: number): number => {
  let z = 0

  for (let bit = 7; bit >= 0; bit--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> bit) & 1) * x
  }

  return z
}

const divisor = (degree: number): number[] => {
  const result = new Array<number>(degree).fill(0)

  result[degree - 1] = 1

  let root = 1

  for (let index = 0; index < degree; index++) {
    for (let term = 0; term < result.length; term++) {
      const next = term + 1 < result.length ? result[term + 1]! : 0

      result[term] = multiply(result[term]!, root) ^ next
    }

    root = multiply(root, 0x02)
  }

  return result
}

const remainder = (data: readonly number[], div: readonly number[]): number[] => {
  const result = new Array<number>(div.length).fill(0)

  for (const byte of data) {
    const factor = byte ^ result.shift()!

    result.push(0)
    div.forEach((coefficient, index) => {
      result[index] = result[index]! ^ multiply(coefficient, factor)
    })
  }

  return result
}

const interleave = (data: readonly number[], version: number, ecc: QrErrorCorrection): number[] => {
  const level = ECC_INDEX[ecc]
  const blocks = NUM_ERROR_CORRECTION_BLOCKS[level]![version]!
  const eccLength = ECC_CODEWORDS_PER_BLOCK[level]![version]!
  const raw = Math.floor(rawDataModules(version) / 8)
  const shortBlocks = blocks - (raw % blocks)
  const shortLength = Math.floor(raw / blocks)
  const div = divisor(eccLength)
  const parts: number[][] = []

  for (let index = 0, offset = 0; index < blocks; index++) {
    const length = shortLength - eccLength + (index < shortBlocks ? 0 : 1)
    const chunk = data.slice(offset, offset + length)

    offset += length

    const block = [...chunk, ...remainder(chunk, div)]

    // Short blocks get a gap so every block lines up column by column.
    if (index < shortBlocks) block.splice(chunk.length, 0, 0)

    parts.push(block)
  }

  const result: number[] = []

  for (let column = 0; column < parts[0]!.length; column++) {
    parts.forEach((block, index) => {
      if (column !== shortLength - eccLength || index >= shortBlocks) result.push(block[column]!)
    })
  }

  return result
}

const alignmentPositions = (version: number): number[] => {
  if (version === 1) return []

  const count = Math.floor(version / 7) + 2
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2
  const positions = [6]

  for (let position = version * 4 + 10; positions.length < count; position -= step) positions.splice(1, 0, position)

  return positions
}

/** Calls `visit` for every (dx, dy) in the square of the given radius. */
const square = (radius: number, visit: (dx: number, dy: number) => void): void => {
  const side = radius * 2 + 1

  for (let index = 0; index < side * side; index++) visit((index % side) - radius, Math.floor(index / side) - radius)
}

/** Calls `visit` for every cell of a size×size grid, row by row. */
const eachCell = (size: number, visit: (x: number, y: number) => void): void => {
  for (let index = 0; index < size * size; index++) visit(index % size, Math.floor(index / size))
}

type Grid = {
  readonly size: number
  readonly modules: boolean[][]
  readonly reserved: boolean[][]
}

const setModule = (grid: Grid, x: number, y: number, dark: boolean): void => {
  grid.modules[y]![x] = dark
  grid.reserved[y]![x] = true
}

const drawFormat = (grid: Grid, ecc: QrErrorCorrection, mask: number): void => {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask

  let rem = data

  for (let index = 0; index < 10; index++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)

  const bits = ((data << 10) | rem) ^ 0x5412
  const bit = (index: number) => ((bits >>> index) & 1) !== 0
  const size = grid.size

  for (let index = 0; index <= 5; index++) setModule(grid, 8, index, bit(index))

  setModule(grid, 8, 7, bit(6))
  setModule(grid, 8, 8, bit(7))
  setModule(grid, 7, 8, bit(8))

  for (let index = 9; index < 15; index++) setModule(grid, 14 - index, 8, bit(index))
  for (let index = 0; index < 8; index++) setModule(grid, size - 1 - index, 8, bit(index))
  for (let index = 8; index < 15; index++) setModule(grid, 8, size - 15 + index, bit(index))

  setModule(grid, 8, size - 8, true)
}

const drawVersion = (grid: Grid, version: number): void => {
  if (version < 7) return

  let rem = version

  for (let index = 0; index < 12; index++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)

  const bits = (version << 12) | rem

  for (let index = 0; index < 18; index++) {
    const dark = ((bits >>> index) & 1) !== 0
    const a = grid.size - 11 + (index % 3)
    const b = Math.floor(index / 3)

    setModule(grid, a, b, dark)
    setModule(grid, b, a, dark)
  }
}

const drawFinder = (grid: Grid, x: number, y: number): void => {
  square(4, (dx, dy) => {
    const distance = Math.max(Math.abs(dx), Math.abs(dy))
    const xx = x + dx
    const yy = y + dy

    if (xx >= 0 && xx < grid.size && yy >= 0 && yy < grid.size) setModule(grid, xx, yy, distance !== 2 && distance !== 4)
  })
}

const drawFunctionPatterns = (grid: Grid, version: number, ecc: QrErrorCorrection): void => {
  const size = grid.size

  for (let index = 0; index < size; index++) {
    setModule(grid, 6, index, index % 2 === 0)
    setModule(grid, index, 6, index % 2 === 0)
  }

  drawFinder(grid, 3, 3)
  drawFinder(grid, size - 4, 3)
  drawFinder(grid, 3, size - 4)

  const positions = alignmentPositions(version)
  const last = positions.length - 1

  positions.forEach((x, i) => {
    positions.forEach((y, j) => {
      // Alignment patterns skip the three corners that hold finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return

      square(2, (dx, dy) => setModule(grid, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1))
    })
  })

  drawFormat(grid, ecc, 0)
  drawVersion(grid, version)
}

// The zigzag order of data modules: two-module columns from the right, alternating
// up and down, skipping the vertical timing column.
const zigzag = (size: number): [number, number][] => {
  const rights: number[] = []

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5

    rights.push(right)
  }

  return rights.flatMap((right) => {
    const upward = ((right + 1) & 2) === 0

    return Array.from({ length: size * 2 }, (_, step): [number, number] => {
      const vertical = step >> 1

      return [right - (step & 1), upward ? size - 1 - vertical : vertical]
    })
  })
}

const drawCodewords = (grid: Grid, data: readonly number[]): void => {
  let bit = 0

  for (const [x, y] of zigzag(grid.size)) {
    if (grid.reserved[y]![x] || bit >= data.length * 8) continue

    grid.modules[y]![x] = ((data[bit >>> 3]! >>> (7 - (bit & 7))) & 1) !== 0
    bit++
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

const applyMask = (grid: Grid, mask: number): void => {
  const test = MASKS[mask]!

  eachCell(grid.size, (x, y) => {
    if (!grid.reserved[y]![x] && test(x, y)) grid.modules[y]![x] = !grid.modules[y]![x]
  })
}

const finderPenaltyCount = (history: number[]): number => {
  const n = history[1]!
  const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n

  return (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) + (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0)
}

const addHistory = (run: number, history: number[], size: number): void => {
  if (history[0] === 0) run += size

  history.pop()
  history.unshift(run)
}

const terminatePenalty = (dark: boolean, run: number, history: number[], size: number): number => {
  if (dark) {
    addHistory(run, history, size)
    run = 0
  }

  run += size
  addHistory(run, history, size)

  return finderPenaltyCount(history)
}

// A run of five same-colored modules costs N1, and every module past five one more.
const runPenalty = (run: number): number => {
  if (run === 5) return PENALTY_N1

  return run > 5 ? 1 : 0
}

const lineScore = (get: (index: number) => boolean, size: number): number => {
  const history = [0, 0, 0, 0, 0, 0, 0]

  let score = 0
  let color = false
  let run = 0

  for (let index = 0; index < size; index++) {
    const dark = get(index)

    if (dark === color) {
      run++
      score += runPenalty(run)

      continue
    }

    addHistory(run, history, size)

    if (!color) score += finderPenaltyCount(history) * PENALTY_N3

    color = dark
    run = 1
  }

  return score + terminatePenalty(color, run, history, size) * PENALTY_N3
}

const penalty = (grid: Grid): number => {
  const { size, modules } = grid

  let score = 0
  let dark = 0

  for (let index = 0; index < size; index++) {
    score += lineScore((x) => modules[index]![x]!, size)
    score += lineScore((y) => modules[y]![index]!, size)
  }

  eachCell(size, (x, y) => {
    const color = modules[y]![x]

    if (color) dark++
    if (x === size - 1 || y === size - 1) return
    if (color === modules[y]![x + 1] && color === modules[y + 1]![x] && color === modules[y + 1]![x + 1]) score += PENALTY_N2
  })

  const total = size * size
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1

  return score + k * PENALTY_N4
}

const appendBits = (bits: number[], value: number, length: number): void => {
  for (let index = length - 1; index >= 0; index--) bits.push((value >>> index) & 1)
}

/** The modules of a QR code for `text`, row by row: true is dark. */
export const encodeQr = (text: string, ecc: QrErrorCorrection = "M"): boolean[][] => {
  const bytes = utf8(text)

  let version = 1

  for (; version <= 40; version++) {
    const lengthBits = version < 10 ? 8 : 16

    if (4 + lengthBits + bytes.length * 8 <= dataCodewords(version, ecc) * 8) break
  }

  if (version > 40) throw new Error("text too long for a QR code")

  const capacity = dataCodewords(version, ecc) * 8
  const bits: number[] = []

  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, version < 10 ? 8 : 16)

  for (const byte of bytes) appendBits(bits, byte, 8)

  appendBits(bits, 0, Math.min(4, capacity - bits.length))
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8)

  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) appendBits(bits, pad, 8)

  const data: number[] = []

  for (let index = 0; index < bits.length; index += 8) {
    data.push(bits.slice(index, index + 8).reduce((byte, bit) => (byte << 1) | bit, 0))
  }

  const size = version * 4 + 17
  const blank = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const base: Grid = { size, modules: blank(), reserved: blank() }

  drawFunctionPatterns(base, version, ecc)
  drawCodewords(base, interleave(data, version, ecc))

  let best: boolean[][] | null = null
  let bestScore = Infinity

  for (let mask = 0; mask < 8; mask++) {
    const grid: Grid = { size, modules: base.modules.map((row) => [...row]), reserved: base.reserved }

    applyMask(grid, mask)
    drawFormat(grid, ecc, mask)

    const score = penalty(grid)

    if (score < bestScore) {
      best = grid.modules
      bestScore = score
    }
  }

  return best!
}

type QrParams = { rows: string[]; dark: string; light: string }

export type QrCodeOptions = Omit<CanvasOptions<QrParams>, "draw" | "params" | "width" | "height" | "animated"> & {
  /** The text to encode, such as a URL or a pairing code. */
  value: string
  /** Error correction: L, M (default), Q or H. */
  errorCorrection?: QrErrorCorrection
  /** Side of the square in pixels, quiet zone included. */
  size?: number
  dark?: string
  light?: string
}

/** A QR code drawn on a canvas, with the four-module quiet zone scanners need. */
export const QrCode = (options: QrCodeOptions): UiNode => {
  const { value, errorCorrection, size = 200, dark = "#000000", light = "#ffffff", ...rest } = options
  const rows = encodeQr(value, errorCorrection).map((row) => row.map((module) => (module ? "1" : "0")).join(""))

  return Canvas<QrParams>({
    ...rest,
    width: size,
    height: size,
    params: { rows, dark, light },
    draw: (ctx, frame) => {
      const { rows: lines, dark: ink, light: paper } = frame.params
      const count = lines.length + 8
      const cell = Math.min(frame.width, frame.height) / count

      ctx.fillStyle = paper
      ctx.fillRect(0, 0, frame.width, frame.height)
      ctx.fillStyle = ink

      lines.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) {
          if (line[x] === "1") ctx.fillRect((x + 4) * cell, (y + 4) * cell, cell + 0.5, cell + 0.5)
        }
      })
    },
  })
}
