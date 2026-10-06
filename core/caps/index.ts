import { registerCapabilities } from "../sdk/caps.ts"
import { fsCaps } from "./fs.ts"
import { netCaps } from "./net.ts"

export type { CapHandler, CapRegistry } from "../sdk/caps.ts"

/** Wire the built-in capabilities into the shared registry. */
export function installCapabilities(): void {
  registerCapabilities({ ...fsCaps, ...netCaps })
}
