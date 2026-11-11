import { readFileSync } from "fs"
import { availableParallelism, freemem } from "os"

const GB = 1024 ** 3

/** Memory one parallel C++ compile job may need. */
export const BUILD_BYTES_PER_JOB = 1.5 * GB

/** Memory one parallel test job (a host with its window and app) may need. */
export const TEST_BYTES_PER_JOB = 2.5 * GB

export interface JobLimits {
  cores: number
  /** Memory that can be used without swapping, in bytes. */
  memory: number
  bytesPerJob: number
  /** Value of the override variable, when it is set. */
  override?: string | undefined
  /** Share of the cores a job count may take; 1 means all of them. */
  coreShare?: number
}

/** The job count for the given limits: a valid override wins, else the cores or the memory, whichever is fewer. */
export const jobCount = (limits: JobLimits): number => {
  const fromEnv = Number(limits.override)

  if (limits.override !== undefined && Number.isInteger(fromEnv) && fromEnv >= 1) return fromEnv

  const byCores = Math.max(1, Math.floor(limits.cores * (limits.coreShare ?? 1)))
  const byMemory = Math.max(1, Math.floor(limits.memory / limits.bytesPerJob))

  return Math.min(byCores, byMemory)
}

/** Parses MemAvailable (kB) from the text of /proc/meminfo. */
export const parseMemAvailable = (meminfo: string): number | undefined => {
  const match = /^MemAvailable:\s+(\d+)\s+kB/m.exec(meminfo)

  return match ? Number(match[1]) * 1024 : undefined
}

/** Memory available to new processes: MemAvailable on Linux, else the free memory the OS reports. */
export const availableMemory = (): number => {
  try {
    const parsed = parseMemAvailable(readFileSync("/proc/meminfo", "utf8"))

    if (parsed !== undefined) return parsed
  } catch {
    // Not Linux: freemem below is the best the OS gives.
  }

  return freemem()
}

/** Parallel C++ compile jobs: PULSAR_BUILD_JOBS, else limited by the cores and about 1.5 GB of RAM per job. */
export const buildJobs = (): number => {
  return jobCount({
    cores: availableParallelism(),
    memory: availableMemory(),
    bytesPerJob: BUILD_BYTES_PER_JOB,
    override: process.env.PULSAR_BUILD_JOBS,
  })
}

/** The `--parallel N` arguments for `cmake --build`. */
export const cmakeParallel = (): string[] => ["--parallel", String(buildJobs())]
