export type Suite = {
  name: string
  cmd: readonly string[]
  /** Needs the C++ host binaries built first. */
  native: boolean
  /** Long suite: started first in a parallel run so it does not become the tail. */
  slow?: boolean
}

// Order is the old `bun run test` order; PULSAR_TEST_JOBS=1 keeps it.
export const suites = [
  { name: "unit", cmd: ["bun", "test", "core", "cli"], native: false },
  { name: "portable", cmd: ["bun", "scripts/portable.ts"], native: false },
  { name: "embedded", cmd: ["bun", "scripts/embedded.ts"], native: true },
  { name: "embedded-qml", cmd: ["bun", "scripts/embedded-qml.ts"], native: true },
  { name: "regressions", cmd: ["bun", "scripts/embedded-regressions.ts"], native: true, slow: true },
  { name: "error-overlay", cmd: ["bun", "scripts/error-overlay.ts"], native: true },
  { name: "smoke", cmd: ["bun", "scripts/smoke.ts"], native: true, slow: true },
] as const satisfies readonly Suite[]

export type SuiteName = (typeof suites)[number]["name"]
