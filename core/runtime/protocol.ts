import { buildHello, type HelloMessage, type RuntimeInfo } from "./framing.ts"

export * from "./framing.ts"
export { createStdioTransport } from "./stdio.ts"

export const runtimeInfo = (): RuntimeInfo => {
  if (typeof Bun !== "undefined") return { name: "bun", version: Bun.version ?? "0.0.0" }
  if (typeof process !== "undefined" && process.versions?.node) {
    return { name: "node", version: process.versions.node }
  }

  return { name: "unknown", version: "0.0.0" }
}

export const runtimeName = (): string => runtimeInfo().name

export const runtimeVersion = (): string => runtimeInfo().version

export const makeHello = (capabilities: string[], binary = true): HelloMessage => {
  return buildHello(runtimeInfo(), capabilities, binary)
}
