import { mkdirSync, rmSync, writeFileSync } from "fs"
import { dirname, join } from "path"

type Pending = {
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export type ControlServer = {
  /** The URL the host polls, passed to it as PULSAR_DEV_URL. */
  readonly url: string
  readonly stop: () => void
}

const REPLY_TIMEOUT_MS = 5000
const POLL_HOLD_MS = 20000

const json = (body: unknown): Response => {
  return Response.json(body, { headers: { "cache-control": "no-store" } })
}

/**
 * The desktop side of `pulsar dev` control: the host long-polls for commands and
 * posts replies, and `pulsar ui`, `tap`, `hover` and the MCP server talk to `/__ctl`.
 * The same protocol as the Android dev channel, so device commands work on both.
 */
export const startDesktopControl = (appDir: string, name: string): ControlServer => {
  const commands: Record<string, unknown>[] = []
  const replies = new Map<number, Pending>()

  let pollResolve: ((response: Response) => void) | undefined
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let commandID = 0

  const finishPoll = (batch: unknown[]): void => {
    const resolve = pollResolve

    if (!resolve) return

    pollResolve = undefined

    if (pollTimer) clearTimeout(pollTimer)

    pollTimer = undefined
    resolve(json({ commands: batch }))
  }

  const control = (body: Record<string, unknown>): Promise<unknown> => {
    return new Promise((resolve) => {
      const request = ++commandID
      const command = { kind: "cmd", request, ts: Date.now(), ...body }
      const timer = setTimeout(() => {
        replies.delete(request)

        const index = commands.indexOf(command)

        if (index >= 0) commands.splice(index, 1)

        resolve({ ok: false, error: "the app did not reply" })
      }, REPLY_TIMEOUT_MS)

      replies.set(request, { resolve, timer })
      commands.push(command)

      if (pollResolve) finishPoll(commands.splice(0))
    })
  }

  const receiveReply = async (request: Request): Promise<void> => {
    const reply = (await request.json().catch(() => null)) as { id?: unknown } | null
    const id = typeof reply?.id === "number" ? reply.id : -1
    const pending = replies.get(id)

    if (!pending) return

    clearTimeout(pending.timer)
    replies.delete(id)
    pending.resolve(reply)
  }

  const waitForCommands = (): Promise<Response> | Response => {
    if (commands.length > 0) return json({ commands: commands.splice(0) })

    finishPoll([])

    return new Promise<Response>((resolve) => {
      pollResolve = resolve
      pollTimer = setTimeout(() => finishPoll([]), POLL_HOLD_MS)
    })
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 30,
    async fetch(request) {
      const path = new URL(request.url).pathname

      if (path === "/__dev/events") return waitForCommands()

      if (path === "/__dev/reply") {
        await receiveReply(request)

        return json({ ok: true })
      }

      if (path === "/__ctl") {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

        return json(await control(body))
      }

      // hello, log and reload need nothing here: the desktop host prints its own logs.
      if (path.startsWith("/__dev/")) return json({ ok: true })

      return new Response(`pulsar dev (${name})\n`, { headers: { "content-type": "text/plain" } })
    },
  })

  const sessionPath = join(appDir, ".pulsar", "dev.json")
  const session = { port: server.port, platform: "desktop", name, pid: process.pid }

  mkdirSync(dirname(sessionPath), { recursive: true })
  writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`)

  const stop = (): void => {
    finishPoll([])

    for (const pending of replies.values()) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, error: "dev stopped" })
    }

    replies.clear()
    void server.stop(true)
    rmSync(sessionPath, { force: true })
  }

  return { url: `http://127.0.0.1:${server.port}/`, stop }
}
