import { spawnSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { formatPerf, summarizePerf, type PerfReport } from "./perf.ts"

interface DevSession {
  port: number
  /** `desktop` for `pulsar dev`; Android sessions predate the field. */
  platform?: "android" | "desktop"
  package?: string
  device?: string
  name: string
}

interface DevReply {
  ok?: boolean
  value?: unknown
  error?: string
}

export interface TapQuery {
  text?: string
  path?: string
  id?: number
  type?: string
  event?: string
}

const KEYCODES: Record<string, number> = {
  back: 4,
  home: 3,
  enter: 66,
  tab: 61,
  escape: 111,
  space: 62,
  delete: 67,
  power: 26,
  volumeup: 24,
  volumedown: 25,
  menu: 82,
  appswitch: 187,
}

const sessionPath = (appDir: string): string => join(appDir, ".pulsar", "dev.json")

const retryable = (error: unknown): boolean => {
  return error instanceof Error && /node not found|no ui tree/i.test(error.message)
}

const settle = async <T>(action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> => {
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    return { ok: false, error }
  }
}

export const controlRetry = async <T>(action: () => Promise<T>, attempts = 10): Promise<T> => {
  let last: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    const outcome = await settle(action)

    if (outcome.ok) return outcome.value

    last = outcome.error

    if (!retryable(last)) throw last

    await new Promise((done) => setTimeout(done, 150))
  }

  throw last
}

export const readSession = (appDir: string): DevSession => {
  const path = sessionPath(appDir)

  if (!existsSync(path)) throw new Error("pulsar dev is not running here (start it first)")

  return JSON.parse(readFileSync(path, "utf8")) as DevSession
}

const isDesktop = (session: DevSession): boolean => {
  return session.platform === "desktop"
}

const androidOnly = (session: DevSession, what: string): void => {
  if (isDesktop(session)) throw new Error(`${what} works with \`pulsar dev --android\`; on the desktop use ${hintFor(what)}`)
}

const hintFor = (what: string): string => {
  if (what === "swipe") return "`pulsar scroll`"
  if (what === "uiautomator") return "`pulsar ui`"

  return "the desktop commands"
}

export const control = async (appDir: string, body: Record<string, unknown>): Promise<unknown> => {
  const session = readSession(appDir)
  const response = await fetch(`http://127.0.0.1:${session.port}/__ctl`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    throw new Error("pulsar dev is not running here (the session file is stale)")
  })
  const reply = (await response.json()) as DevReply

  if (!reply.ok) {
    if (typeof reply.error === "string") throw new Error(reply.error)
    if (typeof reply.value === "string") throw new Error(reply.value)

    throw new Error("device command failed")
  }

  return reply.value
}

const adbInherit = (session: DevSession, args: string[]): void => {
  const result = spawnSync(process.env.ADB ?? "adb", ["-s", session.device ?? "", ...args], { stdio: "inherit" })

  if (result.status !== 0) throw new Error(`adb ${args.join(" ")} failed`)
}

const adbText = (session: DevSession, args: string[]): string => {
  const result = spawnSync(process.env.ADB ?? "adb", ["-s", session.device ?? "", ...args], { encoding: "utf8" })

  if (result.status !== 0) throw new Error(`adb ${args.join(" ")} failed`)

  return result.stdout
}

const collectTexts = (value: unknown): string[] => {
  const out: string[] = []

  const walk = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const child of item) walk(child)

      return
    }

    if (!item || typeof item !== "object") return

    const node = item as Record<string, unknown>
    const props = (node.props ?? {}) as Record<string, unknown>

    for (const key of ["text", "title", "placeholder", "label", "value", "a11yLabel"]) {
      const text = props[key]

      if (typeof text === "string" && text.length > 0) out.push(text)
    }

    if (node.children) walk(node.children)
  }

  walk(value)

  return out
}

export const treeTexts = async (appDir: string): Promise<string[]> => {
  return collectTexts(await control(appDir, { cmd: "tree" }))
}

const systemUI = async (appDir: string) => {
  const session = readSession(appDir)
  const remote = "/sdcard/pulsar-ui.xml"

  androidOnly(session, "uiautomator")

  for (let attempt = 0; attempt < 3; attempt++) {
    const dump = spawnSync(process.env.ADB ?? "adb", ["-s", session.device ?? "", "shell", "uiautomator", "dump", remote], {
      encoding: "utf8",
    })

    if (dump.status === 0 && dump.stdout.includes("dumped")) break

    await new Promise((done) => setTimeout(done, 300))
  }

  console.log(adbText(session, ["exec-out", "cat", remote]))
  spawnSync(process.env.ADB ?? "adb", ["-s", session.device ?? "", "shell", "rm", "-f", remote], { stdio: "ignore" })
}

export const deviceUI = async (appDir: string, system = false): Promise<void> => {
  if (system) {
    await systemUI(appDir)

    return
  }

  console.log(JSON.stringify(await control(appDir, { cmd: "tree" }), null, 2))
}

export const deviceState = async (appDir: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "state" }), null, 2))
}

const selectorOf = (query: TapQuery): Record<string, unknown> => {
  if (query.id !== undefined) return { id: query.id }
  if (query.path) return { path: query.path }
  if (query.type) return { type: query.type }
  if (query.text) return { text: query.text }

  return {}
}

/**
 * On the desktop a tap is a real click at the node, so hover, press states and
 * focus behave as with a mouse. `--event` (or Android) dispatches the event directly.
 */
export const deviceTap = async (appDir: string, query: TapQuery): Promise<void> => {
  const desktop = isDesktop(readSession(appDir))
  const body: Record<string, unknown> =
    desktop && !query.event
      ? { cmd: "pointer", action: "click", ...selectorOf(query) }
      : { cmd: "tap", ...selectorOf(query), ...(query.event ? { event: query.event } : {}) }

  const value = await controlRetry(() => control(appDir, body))

  console.log(JSON.stringify(value))
}

export const deviceTapAt = async (appDir: string, x: number, y: number): Promise<void> => {
  const session = readSession(appDir)

  if (isDesktop(session)) {
    console.log(JSON.stringify(await control(appDir, { cmd: "pointer", action: "click", x, y })))

    return
  }

  adbInherit(session, ["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))])
  console.log(JSON.stringify({ at: [x, y] }))
}

/** Desktop: moves the pointer over a node (or `leave` to take it off the window). */
export const deviceHover = async (appDir: string, query: TapQuery, leave = false): Promise<void> => {
  const body = { cmd: "pointer", action: leave ? "leave" : "hover", ...selectorOf(query) }

  console.log(JSON.stringify(await controlRetry(() => control(appDir, body))))
}

/** Desktop: turns the wheel over a node; positive `dy` scrolls the content down. */
export const deviceScroll = async (appDir: string, query: TapQuery, dy: number): Promise<void> => {
  console.log(JSON.stringify(await controlRetry(() => control(appDir, { cmd: "wheel", dy, ...selectorOf(query) }))))
}

/** Plays a scenario in the running app and records every frame it draws. */
export const devicePerf = async (appDir: string, scenarioPath: string, outPath?: string): Promise<void> => {
  const steps = JSON.parse(readFileSync(scenarioPath, "utf8")) as unknown[]
  const report = (await control(appDir, { cmd: "perf", steps })) as PerfReport

  if (report.error) throw new Error(report.error)

  if (outPath) writeFileSync(outPath, JSON.stringify(report))

  console.log(formatPerf(report, summarizePerf(report)))
}

/** Desktop: types text key by key into the focused field. */
export const deviceKeys = async (appDir: string, text: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "keys", text })))
}

export const deviceSwipe = async (
  appDir: string,
  from: [number, number],
  to: [number, number],
  duration?: number,
): Promise<void> => {
  const session = readSession(appDir)

  androidOnly(session, "swipe")
  const args = ["shell", "input", "swipe", ...from.map(String), ...to.map(String)]

  if (duration !== undefined) args.push(String(Math.round(duration)))

  adbInherit(session, args)
  console.log(JSON.stringify({ swipe: [...from, ...to], duration: duration ?? 300 }))
}

export const resolveKey = (key: string): string | undefined => {
  if (/^\d+$/.test(key)) return key

  const code = KEYCODES[key.toLowerCase()]

  return code === undefined ? undefined : String(code)
}

export const deviceKey = async (appDir: string, key: string): Promise<void> => {
  const session = readSession(appDir)

  // Desktop keys take modifiers: `ctrl+n`, `shift+tab`.
  if (isDesktop(session)) {
    const parts = key.split("+")
    const name = parts.pop() ?? ""

    console.log(JSON.stringify(await control(appDir, { cmd: "key", key: name, modifiers: parts })))

    return
  }

  const code = resolveKey(key)

  if (code === undefined) throw new Error(`unknown key: ${key} (use a name or a numeric keycode)`)

  adbInherit(session, ["shell", "input", "keyevent", code])
  console.log(JSON.stringify({ key, code }))
}

export const deviceType = async (appDir: string, text: string, into?: string): Promise<void> => {
  const value = await controlRetry(() => control(appDir, { cmd: "type", value: text, ...(into ? { into } : {}) }))

  console.log(JSON.stringify(value))
}

export const deviceToggle = async (appDir: string, text: string, value?: boolean): Promise<void> => {
  console.log(
    JSON.stringify(
      await controlRetry(() => control(appDir, { cmd: "toggle", text, ...(value === undefined ? {} : { value }) })),
    ),
  )
}

export const deviceSelect = async (appDir: string, text: string, value: string): Promise<void> => {
  console.log(JSON.stringify(await controlRetry(() => control(appDir, { cmd: "select", text, value }))))
}

export const deviceBack = async (appDir: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "back" })))
}

export const deviceReload = async (appDir: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "reload" })))
}

export const deviceEval = async (appDir: string, code: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "eval", code }), null, 2))
}

export const deviceExpect = async (appDir: string, text: string, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const texts = await treeTexts(appDir)

    if (texts.some((candidate) => candidate.toLowerCase().includes(text.toLowerCase()))) return

    await new Promise((done) => setTimeout(done, 100))
  }

  throw new Error(`text not found: ${text}`)
}

export const captureShot = async (appDir: string, out?: string, windowOnly = false): Promise<string> => {
  const session = readSession(appDir)
  const target = resolve(out ?? join(appDir, ".pulsar", "shots", `${Date.now()}.png`))

  mkdirSync(dirname(target), { recursive: true })

  if (windowOnly || isDesktop(session)) {
    const value = (await control(appDir, { cmd: "grab" })) as { data?: string }

    if (!value?.data) throw new Error("screenshot failed")

    writeFileSync(target, Buffer.from(value.data, "base64"))
  } else {
    const result = spawnSync(process.env.ADB ?? "adb", ["-s", session.device ?? "", "exec-out", "screencap", "-p"])

    if (result.status !== 0 || !result.stdout?.length) throw new Error("adb screencap failed")

    writeFileSync(target, result.stdout)
  }

  return target
}

export const deviceShot = async (appDir: string, out?: string, windowOnly = false): Promise<void> => {
  console.log(await captureShot(appDir, out, windowOnly))
}
