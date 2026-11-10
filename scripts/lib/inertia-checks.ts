type Frame = readonly [number, number, number, number, number, number, number | null]
type Input = { t: number; kind: string }
type Report = { frames: Frame[]; inputs: Input[] }

/** The perf report a scenario asked the host for through the dev channel. */
export const perfReport = (output: string): Report | undefined => {
  const line = output.split("\n").find((entry) => entry.startsWith("DRIVE "))

  if (!line) return undefined

  const replies = JSON.parse(line.slice("DRIVE ".length)) as Array<{ ok: boolean; value: Report }>

  return replies[0]?.ok ? replies[0].value : undefined
}

const SWAPPED = 5
const Y = 6

/** Microseconds from `input` until the list has covered `share` of the way from `from` to `to`. */
const timeToShare = (report: Report, input: Input, from: number, to: number, share: number): number => {
  const goal = from + (to - from) * share

  const frame = report.frames.find((entry) => {
    return entry[SWAPPED] >= input.t && entry[Y] !== null && (to > from ? entry[Y] >= goal : entry[Y] <= goal)
  })

  return frame ? (frame[SWAPPED] - input.t) / 1000 : Infinity
}

const yBefore = (report: Report, time: number): number => {
  const frames = report.frames.filter((entry) => entry[SWAPPED] <= time && entry[Y] !== null)

  return frames.at(-1)?.[Y] ?? NaN
}

/** The same fling curve constants as Inertia: what a release at `velocity` px/s travels and for how long. */
export const flingOf = (velocity: number, limit = 8000): { distance: number; duration: number } => {
  const friction = 0.015 * 9.80665 * 39.37 * 160 * 0.84
  const deceleration = 2.358
  const base = Math.log((0.35 * Math.min(Math.abs(velocity), limit)) / friction)

  return {
    distance: (velocity < 0 ? -1 : 1) * friction * Math.exp((deceleration / (deceleration - 1)) * base),
    duration: Math.exp(base / (deceleration - 1)),
  }
}

/** What the wheel, touchpad, fling and press scenario has to show. Returns the first thing that is off. */
export const inertiaProblem = (output: string): string | undefined => {
  const report = perfReport(output)

  if (!report) return "no perf report"

  const wheels = report.inputs.filter((input) => input.kind === "wheel")
  const presses = report.inputs.filter((input) => input.kind === "press")
  const releases = report.inputs.filter((input) => input.kind === "release")

  if (wheels.length < 8 || presses.length < 2 || releases.length < 2) return "inputs missing"

  // A mouse wheel tick moves the target by 120 px, followed by a critically damped spring of stiffness 30.
  const first = wheels[0]!
  const afterFirst = yBefore(report, wheels[1]!.t - 1)
  const mouse = timeToShare(report, first, 0, 120, 0.95)

  if (Math.abs(afterFirst - 120) > 0.01) return `wheel tick settled at ${afterFirst}, not 120`
  if (mouse < 130 || mouse > 230) return `wheel spring reached 95% after ${mouse} ms`

  // The touchpad reports pixels and gets stiffness 60, so the same distance takes about half the time.
  const second = wheels[1]!
  const afterSecond = yBefore(report, presses[0]!.t - 1)
  const pad = timeToShare(report, second, 120, 240, 0.95)

  if (Math.abs(afterSecond - 240) > 0.01) return `touchpad tick settled at ${afterSecond}, not 240`
  if (pad < 50 || pad > 140 || pad / mouse < 0.3 || pad / mouse > 0.7) return `touchpad reached 95% after ${pad} ms`

  // The release speed becomes a fling of the length and duration the curve gives.
  const fling = /PulsarView fling (-?\d+) (-?\d+) (\d+\.\d+)/.exec(output)

  if (!fling) return "no fling"

  const speed = Number(fling[1])
  const expected = flingOf(speed)

  if (Math.abs(Number(fling[2]) - expected.distance) > 1 + Math.abs(expected.distance) * 0.005) {
    return `fling distance ${fling[2]}, expected ${expected.distance}`
  }

  if (Math.abs(Number(fling[3]) - expected.duration) > 0.011)
    return `fling duration ${fling[3]}, expected ${expected.duration}`

  const release = releases.at(-2)!
  const nextWheel = wheels.find((input) => input.t > release.t)!
  const travelled = yBefore(report, nextWheel.t - 1) - yBefore(report, release.t)

  if (Math.abs(travelled - expected.distance) > 25) return `fling travelled ${travelled}, expected ${expected.distance}`

  // A press while the spring still has far to go stops it where it is.
  const stop = presses.at(-1)!
  const start = yBefore(report, nextWheel.t - 1)
  const ahead = start + 6 * 120

  const settled = report.frames
    .filter((entry) => entry[SWAPPED] > stop.t + 60_000 && entry[Y] !== null)
    .map((entry) => entry[Y]!)

  if (yBefore(report, stop.t) - start < 20) return "nothing was moving before the press"
  if (settled.length < 1 || Math.max(...settled) - Math.min(...settled) > 0.5)
    return "the press did not stop the scroll"
  if (settled[0]! > ahead - 60) return `the scroll went on to ${settled[0]} after the press, target ${ahead}`

  return undefined
}

export const edgeProblem = (output: string): string | undefined => {
  const absorb = /PulsarView absorb (\d+)/.exec(output)

  if (!absorb) return "no absorb at the end of the fling"

  const peak = Number(absorb[1])

  return peak > 0 && peak <= 320 ? undefined : `absorb peak ${peak}`
}
