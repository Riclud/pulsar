import { captureShot, control, controlRetry, readSession, treeTexts, type TapQuery } from "./device.ts"

export interface DeviceSession {
  readonly appDir: string
  ui: () => Promise<unknown>
  state: () => Promise<Record<string, unknown>>
  texts: () => Promise<string[]>
  tap: (query: TapQuery) => Promise<unknown>
  type: (text: string, into?: string) => Promise<unknown>
  toggle: (text: string, value?: boolean) => Promise<unknown>
  select: (text: string, value: string) => Promise<unknown>
  back: () => Promise<unknown>
  reload: () => Promise<unknown>
  eval: (code: string) => Promise<unknown>
  expect: (text: string, timeoutMs?: number) => Promise<void>
  shot: (out?: string, windowOnly?: boolean) => Promise<string>
}

const tapBody = (query: TapQuery): Record<string, unknown> => {
  const body: Record<string, unknown> = { cmd: "tap" }

  if (query.id !== undefined) body.id = query.id
  else if (query.path) body.path = query.path
  else if (query.type) body.type = query.type
  else if (query.text) body.text = query.text

  if (query.event) body.event = query.event

  return body
}

/** Connect to a running `pulsar dev --android` session for this app. */
export const connect = (appDir = process.cwd()): DeviceSession => {
  readSession(appDir)

  return {
    appDir,
    ui: () => control(appDir, { cmd: "tree" }),
    state: async () => (await control(appDir, { cmd: "state" })) as Record<string, unknown>,
    texts: () => treeTexts(appDir),
    tap: (query) => controlRetry(() => control(appDir, tapBody(query))),
    type: (text, into) => controlRetry(() => control(appDir, { cmd: "type", value: text, ...(into ? { into } : {}) })),
    toggle: (text, value) =>
      controlRetry(() => control(appDir, { cmd: "toggle", text, ...(value === undefined ? {} : { value }) })),
    select: (text, value) => controlRetry(() => control(appDir, { cmd: "select", text, value })),
    back: () => control(appDir, { cmd: "back" }),
    reload: () => control(appDir, { cmd: "reload" }),
    eval: (code) => control(appDir, { cmd: "eval", code }),
    expect: async (text, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs

      while (Date.now() < deadline) {
        const texts = await treeTexts(appDir)

        if (texts.some((candidate) => candidate.toLowerCase().includes(text.toLowerCase()))) return

        await new Promise((done) => setTimeout(done, 100))
      }

      throw new Error(`text not found: ${text}`)
    },
    shot: (out, windowOnly) => captureShot(appDir, out, windowOnly),
  }
}
