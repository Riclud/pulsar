import type { CapRegistry } from "./types.ts"

const FETCH_TIMEOUT_MS = 30_000

export const netCaps: CapRegistry = {
  "nw.fetch": async (p: { url: string }) => {
    const res = await fetch(p.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    const text = await res.text()

    return { status: res.status, url: res.url, text }
  },
}
