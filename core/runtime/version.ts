/** Three-part numeric compare, tolerant of missing parts ("1.2" == "1.2.0"). */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0)
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** Pulsar's compatibility floor for the Bun runtime. */
export const MIN_BUN = "1.2.0"

export function bunVersionCompatible(version: string, min = MIN_BUN): boolean {
  return compareSemver(version, min) >= 0
}
