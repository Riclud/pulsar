import { spawnSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join, resolve } from "path"

interface DevSession {
  port: number
  package: string
  device: string
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

export const controlRetry = async <T>(action: () => Promise<T>, attempts = 10): Promise<T> => {
  let last: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await action()
    } catch (e) {
      last = e

      if (!retryable(e)) throw e

      await new Promise((done) => setTimeout(done, 150))
    }
  }

  throw last
}

export const readSession = (appDir: string): DevSession => {
  const path = sessionPath(appDir)

  if (!existsSync(path)) throw new Error("pulsar dev --android is not running here (start it first)")

  return JSON.parse(readFileSync(path, "utf8")) as DevSession
}

export const control = async (appDir: string, body: Record<string, unknown>): Promise<unknown> => {
  const session = readSession(appDir)
  const response = await fetch(`http://127.0.0.1:${session.port}/__ctl`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
  const result = spawnSync(process.env.ADB ?? "adb", ["-s", session.device, ...args], { stdio: "inherit" })

  if (result.status !== 0) throw new Error(`adb ${args.join(" ")} failed`)
}

const adbText = (session: DevSession, args: string[]): string => {
  const result = spawnSync(process.env.ADB ?? "adb", ["-s", session.device, ...args], { encoding: "utf8" })

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
    const props = node.props as Record<string, unknown> | undefined

    if (props) {
      for (const key of ["text", "title", "placeholder", "label", "value"]) {
        const text = props[key]

        if (typeof text === "string" && text.length > 0) out.push(text)
      }
    }

    if (node.children) walk(node.children)
  }

  walk(value)

  return out
}

export const treeTexts = async (appDir: string): Promise<string[]> => {
  return collectTexts(await control(appDir, { cmd: "tree" }))
}

export const deviceUI = async (appDir: string, system = false): Promise<void> => {
  if (system) {
    const session = readSession(appDir)
    const remote = "/sdcard/pulsar-ui.xml"

    for (let attempt = 0; attempt < 3; attempt++) {
      const dump = spawnSync(process.env.ADB ?? "adb", ["-s", session.device, "shell", "uiautomator", "dump", remote], {
        encoding: "utf8",
      })

      if (dump.status === 0 && dump.stdout.includes("dumped")) break

      await new Promise((done) => setTimeout(done, 300))
    }

    console.log(adbText(session, ["exec-out", "cat", remote]))
    spawnSync(process.env.ADB ?? "adb", ["-s", session.device, "shell", "rm", "-f", remote], { stdio: "ignore" })

    return
  }

  console.log(JSON.stringify(await control(appDir, { cmd: "tree" }), null, 2))
}

export const deviceState = async (appDir: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "state" }), null, 2))
}

export const deviceTap = async (appDir: string, query: TapQuery): Promise<void> => {
  const body: Record<string, unknown> = { cmd: "tap" }

  if (query.id !== undefined) body.id = query.id
  else if (query.path) body.path = query.path
  else if (query.type) body.type = query.type
  else if (query.text) body.text = query.text

  if (query.event) body.event = query.event

  const value = await controlRetry(() => control(appDir, body))

  console.log(JSON.stringify(value))
}

export const deviceTapAt = async (appDir: string, x: number, y: number): Promise<void> => {
  const session = readSession(appDir)

  adbInherit(session, ["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))])
  console.log(JSON.stringify({ at: [x, y] }))
}

export const deviceSwipe = async (
  appDir: string,
  from: [number, number],
  to: [number, number],
  duration?: number,
): Promise<void> => {
  const session = readSession(appDir)
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

  if (windowOnly) {
    const value = (await control(appDir, { cmd: "grab" })) as { data?: string }

    if (!value?.data) throw new Error("screenshot failed")

    writeFileSync(target, Buffer.from(value.data, "base64"))
  } else {
    const result = spawnSync(process.env.ADB ?? "adb", ["-s", session.device, "exec-out", "screencap", "-p"])

    if (result.status !== 0 || !result.stdout?.length) throw new Error("adb screencap failed")

    writeFileSync(target, result.stdout)
  }

  return target
}

export const deviceShot = async (appDir: string, out?: string, windowOnly = false): Promise<void> => {
  console.log(await captureShot(appDir, out, windowOnly))
}
