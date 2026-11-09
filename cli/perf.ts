/** One frame: animating, syncStart, syncEnd, renderStart, renderEnd, swapped (µs), then the list position. */
export type PerfFrame = readonly [number, number, number, number, number, number, number | null]

export interface PerfInput {
  readonly t: number
  readonly kind: string
}

export interface PerfReport {
  readonly api?: string
  readonly refreshHz?: number
  readonly width?: number
  readonly height?: number
  readonly frames: readonly PerfFrame[]
  readonly inputs: readonly PerfInput[]
  readonly error?: string
}

export interface PerfStats {
  readonly median: number
  readonly p95: number
  readonly max: number
}

export interface PerfSummary {
  readonly frames: number
  readonly gap: PerfStats
  readonly lateFrames: number
  readonly gui: PerfStats
  readonly sync: PerfStats
  readonly render: PerfStats
  readonly movingFrames: number
  readonly stutters: number
  readonly reversals: number
  readonly motionJitter: number
  readonly wheelLatency: PerfStats | null
}

const FRAME_ANIMATING = 0
const FRAME_SYNC_START = 1
const FRAME_SYNC_END = 2
const FRAME_RENDER_START = 3
const FRAME_RENDER_END = 4
const FRAME_SWAPPED = 5
const FRAME_Y = 6

/** A longer gap is an idle window with nothing to draw, not a late frame. */
const IDLE_GAP_US = 250_000

/** Movement below this many pixels counts as standing still. */
const STILL_PX = 0.05

/** A moving frame that covers less than this share of its neighbours' distance reads as a hitch. */
const HITCH_RATIO = 0.4

const stats = (values: readonly number[]): PerfStats => {
  if (values.length === 0) return { median: 0, p95: 0, max: 0 }

  const sorted = [...values].sort((a, b) => a - b)

  const at = (share: number) => {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!
  }

  return { median: at(0.5), p95: at(0.95), max: sorted.at(-1)! }
}

const toMs = (microseconds: number): number => microseconds / 1000

const durations = (frames: readonly PerfFrame[], from: number, to: number): number[] => {
  return frames.filter((frame) => frame[from]! >= 0 && frame[to]! >= 0).map((frame) => toMs(frame[to]! - frame[from]!))
}

const countMotion = (deltas: readonly number[]) => {
  let stutters = 0
  let reversals = 0
  let jitterSum = 0
  let jitterCount = 0
  let moving = 0

  for (let index = 1; index < deltas.length - 1; index++) {
    const previous = deltas[index - 1]!
    const current = deltas[index]!
    const next = deltas[index + 1]!
    const neighbours = (Math.abs(previous) + Math.abs(next)) / 2

    if (neighbours <= STILL_PX) continue

    moving++
    jitterSum += Math.abs(Math.abs(current) - neighbours) / neighbours
    jitterCount++

    if (Math.abs(current) < neighbours * HITCH_RATIO) stutters++

    if (previous * next > 0 && current * previous < 0) reversals++
  }

  return { moving, stutters, reversals, jitter: jitterCount > 0 ? jitterSum / jitterCount : 0 }
}

const wheelLatencies = (report: PerfReport): number[] => {
  const moves = report.frames.flatMap((frame, index) => {
    const previous = report.frames[index - 1]
    const y = frame[FRAME_Y]
    const before = previous?.[FRAME_Y]

    if (y === null || before === null || before === undefined) return []

    return Math.abs(y - before) > STILL_PX ? [frame[FRAME_SWAPPED]] : []
  })

  return report.inputs
    .filter((input) => input.kind === "wheel")
    .flatMap((input) => {
      const firstMove = moves.find((swapped) => swapped >= input.t)

      return firstMove === undefined ? [] : [toMs(firstMove - input.t)]
    })
}

/** Reduces a recording to the numbers that decide how smooth it looks. */
export const summarizePerf = (report: PerfReport): PerfSummary => {
  const { frames } = report
  const gaps = frames
    .slice(1)
    .map((frame, index) => frame[FRAME_SWAPPED] - frames[index]![FRAME_SWAPPED])
    .filter((gap) => gap < IDLE_GAP_US)
    .map(toMs)
  const gap = stats(gaps)
  const positions = frames.map((frame) => frame[FRAME_Y])
  const deltas = positions.slice(1).flatMap((y, index) => {
    const before = positions[index]

    return y === null || before === null || before === undefined ? [] : [y - before]
  })
  const motion = countMotion(deltas)
  const latencies = wheelLatencies(report)

  return {
    frames: frames.length,
    gap,
    lateFrames: gaps.filter((value) => value > gap.median * 1.5).length,
    gui: stats(durations(frames, FRAME_ANIMATING, FRAME_SYNC_START)),
    sync: stats(durations(frames, FRAME_SYNC_START, FRAME_SYNC_END)),
    render: stats(durations(frames, FRAME_RENDER_START, FRAME_RENDER_END)),
    movingFrames: motion.moving,
    stutters: motion.stutters,
    reversals: motion.reversals,
    motionJitter: motion.jitter,
    wheelLatency: latencies.length > 0 ? stats(latencies) : null,
  }
}

const formatStats = (value: PerfStats): string => {
  return `${value.median.toFixed(1)} / ${value.p95.toFixed(1)} / ${value.max.toFixed(1)} ms`
}

export const formatPerf = (report: PerfReport, summary: PerfSummary): string => {
  const lines = [
    `graphics     ${report.api ?? "?"}, ${report.refreshHz ?? "?"} Hz, ${report.width ?? "?"}x${report.height ?? "?"}`,
    `frames       ${summary.frames}, late ${summary.lateFrames}`,
    `gap          ${formatStats(summary.gap)}  (median / p95 / max)`,
    `gui thread   ${formatStats(summary.gui)}`,
    `sync         ${formatStats(summary.sync)}`,
    `render       ${formatStats(summary.render)}`,
    `motion       ${summary.movingFrames} moving frames, ${summary.stutters} stutters, ${summary.reversals} reversals, jitter ${(summary.motionJitter * 100).toFixed(1)}%`,
  ]

  if (summary.wheelLatency) lines.push(`wheel lag    ${formatStats(summary.wheelLatency)}`)

  return lines.join("\n")
}
