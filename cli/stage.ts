import { spawn } from "child_process"
import { ui } from "./ui.ts"

export interface StageOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Written to the tool's stdin. */
  input?: string
  /** How many of the last output lines are shown when the stage fails. */
  tail?: number
  /** Seconds between "still running" lines for a long stage; 0 turns them off. */
  heartbeat?: number
}

export interface StageResult {
  status: number | null
  output: string
  ms: number
}

export interface StageLog {
  step(text: string): void
  done(text: string): void
  error(text: string): void
  note(text: string): void
}

/** `--verbose` (or PULSAR_VERBOSE=1) streams the tools' output instead of keeping it for a failure. */
export const verbose = (): boolean => process.argv.includes("--verbose") || Boolean(process.env.PULSAR_VERBOSE)

export const lastLines = (text: string, count: number): string => {
  const lines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "")

  return lines.slice(-count).join("\n")
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`

/**
 * Runs one stage of a build: a line when it starts, a line when it ends, and the tail of the tool's
 * output when it fails. The full output stays in `result.output`.
 */
export const runStage = async (
  label: string,
  command: string,
  args: string[],
  options: StageOptions = {},
  log: StageLog = ui,
): Promise<StageResult> => {
  const started = Date.now()
  const streaming = verbose()

  log.step(label)

  const status = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: [
        options.input === undefined ? "ignore" : "pipe",
        streaming ? "inherit" : "pipe",
        streaming ? "inherit" : "pipe",
      ],
      shell: process.platform === "win32" && /\.(bat|cmd)$/i.test(command),
    })

    let output = ""
    let beat: ReturnType<typeof setInterval> | undefined

    const heartbeat = options.heartbeat ?? 20

    if (heartbeat > 0) {
      beat = setInterval(() => log.note(`${label}: still running (${seconds(Date.now() - started)})`), heartbeat * 1000)
    }

    const collect = (chunk: Buffer): void => {
      output += chunk.toString("utf8")
    }

    child.stdout?.on("data", collect)
    child.stderr?.on("data", collect)

    if (options.input !== undefined) child.stdin?.end(options.input)

    child.on("error", (error) => {
      output += `${error.message}\n`
      clearInterval(beat)
      resolve({ code: null, output })
    })
    child.on("close", (code) => {
      clearInterval(beat)
      resolve({ code, output })
    })
  })

  const ms = Date.now() - started

  if (status.code === 0) {
    log.done(`${label} (${seconds(ms)})`)

    return { status: 0, output: status.output, ms }
  }

  log.error(`${label} failed${status.code === null ? "" : ` (exit ${status.code})`} after ${seconds(ms)}`)

  if (!streaming) {
    const tail = lastLines(status.output, options.tail ?? 40)

    if (tail) log.note(`last output of ${command}:\n${tail}`)

    log.note("run again with --verbose to see all of it")
  }

  return { status: status.code, output: status.output, ms }
}
