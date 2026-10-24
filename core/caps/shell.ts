import type { Platform } from "../platform.ts"
import type { CapRegistry } from "../sdk/index.ts"

export const createShellCaps = (platform: Platform): CapRegistry => ({
  "shell.open": (p: { url: string }) => platform.openUrl(p.url),
})
