import { registerCapabilities } from "../sdk/caps.ts"
import { fsCaps } from "./fs.ts"
import { netCaps } from "./net.ts"
import { pathsCaps } from "./paths.ts"
import { storageCaps } from "./storage.ts"

export type { CapHandler, CapRegistry } from "../sdk/caps.ts"

/** Wire the built-in capabilities into the shared registry. */
export function installCapabilities(): void {
  registerCapabilities({ ...fsCaps, ...netCaps, ...pathsCaps, ...storageCaps })
}
