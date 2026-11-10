/** A step of a scripted dev-channel session: `cmd` is sent to the host `at` milliseconds after it connects. */
export type DriveStep = {
  at: number
  cmd: Record<string, unknown>
}

export type DriveSession = {
  url: string
  replies: Array<{ id: number; ok: boolean; value: unknown }>
  stop: () => void
}

/**
 * The part of `pulsar dev` that a test needs: it answers the host's hello, hands out the scripted
 * commands on the events poll, and keeps the replies. Real pointer input then reaches the window.
 */
export const startDrive = (steps: readonly DriveStep[]): DriveSession => {
  const queue: Record<string, unknown>[] = []
  const replies: DriveSession["replies"] = []

  let wake: (() => void) | undefined
  let started = false

  const push = (command: Record<string, unknown>) => {
    queue.push(command)
    wake?.()
  }

  const arm = () => {
    if (started) return

    started = true

    steps.forEach((step, index) => {
      setTimeout(() => push({ kind: "cmd", request: index + 1, ts: Date.now(), ...step.cmd }), step.at)
    })
  }

  const events = async () => {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        wake = resolve
        setTimeout(resolve, 5000)
      })
    }

    wake = undefined

    return Response.json({ commands: queue.splice(0) })
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 30,
    fetch: async (request) => {
      const path = new URL(request.url).pathname

      if (path === "/__dev/hello") {
        arm()

        return Response.json({ ok: true })
      }

      if (path === "/__dev/events") return events()

      if (path === "/__dev/reply") {
        const body = (await request.json()) as { id: number; ok: boolean; value: unknown }

        replies.push({ id: body.id, ok: body.ok, value: body.value })
      }

      return Response.json({ ok: true })
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}/`,
    replies,
    stop: () => void server.stop(true),
  }
}
