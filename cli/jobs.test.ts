import { describe, expect, test } from "bun:test"
import { BUILD_BYTES_PER_JOB, TEST_BYTES_PER_JOB, jobCount, parseMemAvailable } from "./jobs.ts"

const GB = 1024 ** 3

describe("jobCount", () => {
  test("takes every core when memory is plentiful", () => {
    expect(jobCount({ cores: 8, memory: 64 * GB, bytesPerJob: BUILD_BYTES_PER_JOB })).toBe(8)
  })

  test("is held back by memory", () => {
    expect(jobCount({ cores: 16, memory: 6 * GB, bytesPerJob: BUILD_BYTES_PER_JOB })).toBe(4)
    expect(jobCount({ cores: 16, memory: 6 * GB, bytesPerJob: TEST_BYTES_PER_JOB })).toBe(2)
  })

  test("never goes below one job", () => {
    expect(jobCount({ cores: 4, memory: 0.2 * GB, bytesPerJob: BUILD_BYTES_PER_JOB })).toBe(1)
    expect(jobCount({ cores: 0, memory: 8 * GB, bytesPerJob: BUILD_BYTES_PER_JOB })).toBe(1)
  })

  test("a core share limits the count first", () => {
    expect(jobCount({ cores: 8, memory: 64 * GB, bytesPerJob: TEST_BYTES_PER_JOB, coreShare: 0.5 })).toBe(4)
    expect(jobCount({ cores: 1, memory: 64 * GB, bytesPerJob: TEST_BYTES_PER_JOB, coreShare: 0.5 })).toBe(1)
  })

  test("a valid override wins over cores and memory", () => {
    expect(jobCount({ cores: 4, memory: GB, bytesPerJob: BUILD_BYTES_PER_JOB, override: "12" })).toBe(12)
  })

  test("an invalid override is ignored", () => {
    for (const override of ["", "0", "-2", "1.5", "many"]) {
      expect(jobCount({ cores: 4, memory: 64 * GB, bytesPerJob: BUILD_BYTES_PER_JOB, override })).toBe(4)
    }
  })
})

describe("parseMemAvailable", () => {
  test("reads MemAvailable in bytes", () => {
    const text =
      "MemTotal:       15728640 kB\nMemFree:          200000 kB\nMemAvailable:    8388608 kB\nBuffers: 1 kB\n"

    expect(parseMemAvailable(text)).toBe(8 * GB)
  })

  test("is undefined without the line", () => {
    expect(parseMemAvailable("MemTotal: 1 kB\n")).toBeUndefined()
  })
})
