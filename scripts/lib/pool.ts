import { availableParallelism } from "os"

/** Worker count for parallel test steps: PULSAR_TEST_JOBS, else half the cores. 1 means strictly serial. */
export const testJobs = (): number => {
  const fromEnv = Number(process.env.PULSAR_TEST_JOBS)

  if (Number.isInteger(fromEnv) && fromEnv >= 1) return fromEnv

  return Math.max(1, Math.floor(availableParallelism() / 2))
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
