import { registerCapabilities } from "../sdk/caps.ts"
import type { Platform } from "../platform.ts"
import { createFsCaps } from "./fs.ts"
import { createPathsCaps } from "./paths.ts"
import { createShellCaps } from "./shell.ts"
import { createStorageCaps } from "./storage.ts"

export type { CapHandler, CapRegistry } from "../sdk/caps.ts"

/** Wire the built-in capabilities for a platform into the shared registry. */
export const installCapabilities = (platform: Platform): void => {
  registerCapabilities({
    ...createFsCaps(platform),
    ...createPathsCaps(platform),
    ...createStorageCaps(platform),
    ...createShellCaps(platform),
  })
}
