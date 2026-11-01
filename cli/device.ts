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

const sessionPath = (appDir: string): string => join(appDir, ".pulsar", "dev.json")

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

const collectText = (value: unknown, out: string[]): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out)

    return
  }

  if (!value || typeof value !== "object") return

  const node = value as Record<string, unknown>
  const props = node.props as Record<string, unknown> | undefined

  if (props) {
    for (const key of ["text", "title", "placeholder", "label", "value"]) {
      const text = props[key]

      if (typeof text === "string" && text.length > 0) out.push(text)
    }
  }

  if (node.children) collectText(node.children, out)
}

export const deviceUI = async (appDir: string): Promise<void> => {
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

  const value = await control(appDir, body)

  console.log(JSON.stringify(value))
}

export const deviceType = async (appDir: string, text: string, into?: string): Promise<void> => {
  const value = await control(appDir, { cmd: "type", value: text, ...(into ? { into } : {}) })

  console.log(JSON.stringify(value))
}

export const deviceToggle = async (appDir: string, text: string, value?: boolean): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "toggle", text, ...(value === undefined ? {} : { value }) })))
}

export const deviceSelect = async (appDir: string, text: string, value: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "select", text, value })))
}

export const deviceBack = async (appDir: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "back" })))
}

export const deviceReload = async (appDir: string): Promise<void> => {
  console.log(JSON.stringify(await control(appDir, { cmd: "reload" })))
}

export const deviceExpect = async (appDir: string, text: string, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const tree = await control(appDir, { cmd: "tree" })
    const texts: string[] = []

    collectText(tree, texts)

    if (texts.some((candidate) => candidate.toLowerCase().includes(text.toLowerCase()))) return

    await new Promise((done) => setTimeout(done, 100))
  }

  throw new Error(`text not found: ${text}`)
}

export const deviceShot = async (appDir: string, out?: string, windowOnly = false): Promise<void> => {
  const session = readSession(appDir)
  const target = resolve(out ?? join(appDir, ".pulsar", "shots", `${Date.now()}.png`))

  mkdirSync(dirname(target), { recursive: true })

  if (windowOnly) {
    const value = (await control(appDir, { cmd: "grab" })) as { data?: string }

    if (!value?.data) throw new Error("screenshot failed")

    writeFileSync(target, Buffer.from(value.data, "base64"))
  } else {
    const adb = process.env.ADB ?? "adb"
    const result = spawnSync(adb, ["-s", session.device, "exec-out", "screencap", "-p"])

    if (result.status !== 0 || !result.stdout?.length) throw new Error("adb screencap failed")

    writeFileSync(target, result.stdout)
  }

  console.log(target)
}
