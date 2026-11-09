import { describe, expect, test } from "bun:test"
import { summarizePerf, type PerfFrame, type PerfReport } from "./perf.ts"

const FRAME_US = 16_667

const frame = (swapped: number, y: number | null): PerfFrame => {
  return [swapped - 8000, swapped - 6000, swapped - 5000, swapped - 4000, swapped - 1000, swapped, y]
}

const steadyScroll = (count: number, speed: number): PerfFrame[] => {
  return Array.from({ length: count }, (_, index) => frame(FRAME_US * (index + 1), index * speed))
}

const report = (frames: PerfFrame[], inputs: PerfReport["inputs"] = []): PerfReport => ({ frames, inputs })

describe("summarizePerf", () => {
  test("steady motion has no late frames or stutters", () => {
    const summary = summarizePerf(report(steadyScroll(60, 10)))

    expect(summary.lateFrames).toBe(0)
    expect(summary.stutters).toBe(0)
    expect(summary.motionJitter).toBeCloseTo(0, 5)
    expect(summary.gap.median).toBeCloseTo(16.667, 2)
  })

  test("a frame that barely moves is a stutter even when frames arrive on time", () => {
    const frames = steadyScroll(20, 10).map((item, index): PerfFrame => {
      const y = index < 10 ? index * 10 : (index - 1) * 10 + 1

      return [item[0], item[1], item[2], item[3], item[4], item[5], y]
    })

    const summary = summarizePerf(report(frames))

    expect(summary.lateFrames).toBe(0)
    expect(summary.stutters).toBe(1)
  })

  test("a doubled frame gap counts as late", () => {
    const frames = [...steadyScroll(10, 0), frame(FRAME_US * 12, 0), frame(FRAME_US * 13, 0)]

    expect(summarizePerf(report(frames)).lateFrames).toBe(1)
  })

  test("the gaps of an idle window are not late frames", () => {
    const frames = [...steadyScroll(10, 0), frame(FRAME_US * 10 + 600_000, 0)]

    expect(summarizePerf(report(frames)).lateFrames).toBe(0)
  })

  test("wheel latency runs from the input to the first frame that moved", () => {
    const frames = [frame(16_000, 0), frame(33_000, 0), frame(50_000, 12), frame(67_000, 30)]
    const summary = summarizePerf(report(frames, [{ t: 20_000, kind: "wheel" }]))

    expect(summary.wheelLatency?.median).toBeCloseTo(30, 5)
  })

  test("no wheel input means no latency figure", () => {
    expect(summarizePerf(report(steadyScroll(5, 1))).wheelLatency).toBeNull()
  })
})
