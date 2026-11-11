import { availableParallelism } from "os"
import { TEST_BYTES_PER_JOB, availableMemory, jobCount } from "../../cli/jobs.ts"

/**
 * Worker count for parallel test steps: PULSAR_TEST_JOBS, else half the cores, and at most one job per
 * 2.5 GB of available RAM. 1 means strictly serial.
 */
export const testJobs = (): number => {
  return jobCount({
    cores: availableParallelism(),
    coreShare: 0.5,
    memory: availableMemory(),
    bytesPerJob: TEST_BYTES_PER_JOB,
    override: process.env.PULSAR_TEST_JOBS,
  })
}

/** Runs the tasks with at most `limit` in flight. Results keep the input order. */
export const runPool = async <T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> => {
  const results: T[] = new Array(tasks.length)

  let next = 0

  const worker = async () => {
    while (next < tasks.length) {
      const index = next++

      results[index] = await tasks[index]!()
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))

  return results
}

/** True when the test runner already built every host binary, so a script must not run its own build. */
export const prebuilt = (): boolean => process.env.PULSAR_TEST_PREBUILT === "1"
