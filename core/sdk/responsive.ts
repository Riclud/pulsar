import type { App } from "./app.ts"
import type { UiChild } from "./ui.ts"

export interface BreakpointPoints {
  [name: string]: number
}

export interface BreakpointState {
  name: string
  width: number
}

export interface BreakpointsOptions {
  /** Store key the state is published under (default "breakpoint"). */
  key?: string
  /** Initial window width; updated by window-resize events. */
  width?: number
  /** Only follow resize events for this window label. */
  label?: string
}

export type BreakpointValue = UiChild | ((state: BreakpointState) => UiChild)

const DEFAULT_POINTS: BreakpointPoints = {
  compact: 0,
  medium: 600,
  expanded: 1000,
}

/** Maps window width to a named breakpoint and publishes it to the store. */
export class Breakpoints {
  private readonly points: Array<[string, number]>
  private readonly listeners = new Set<(state: BreakpointState) => void>()
  private readonly key: string
  private readonly label: string | undefined
  private windowWidth: number

  constructor(
    private readonly app: App,
    points: BreakpointPoints = DEFAULT_POINTS,
    options: BreakpointsOptions = {},
  ) {
    this.points = Object.entries(points).sort((a, b) => a[1] - b[1])
    this.key = options.key ?? "breakpoint"
    this.label = options.label
    this.windowWidth = options.width ?? 0

    this.app.on("window-resize", (payload: { label?: string; width?: number }) => {
      if (this.label !== undefined && payload.label !== this.label) return

      this.setWidth(payload.width ?? 0)
    })

    this.publish()
  }

  current(): string {
    const width = this.windowWidth
    let name = this.points[0]?.[0] ?? "compact"

    for (const [candidate, minimum] of this.points) {
      if (width < minimum) break

      name = candidate
    }

    return name
  }

  width(): number {
    return this.windowWidth
  }

  is(name: string): boolean {
    return this.current() === name
  }

  /** True when the current breakpoint is at or above `name`. */
  atLeast(name: string): boolean {
    const current = this.widthOf(this.current())
    const target = this.widthOf(name)

    return current >= target
  }

  setWidth(width: number): this {
    if (width === this.windowWidth) return this

    this.windowWidth = width
    this.publish()

    return this
  }

  subscribe(listener: (state: BreakpointState) => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  /** Pick a value for the current breakpoint. */
  view(values: Record<string, BreakpointValue>): UiChild {
    const state = this.state()
    const value = values[state.name]

    if (value === undefined || value === null) return null
    if (typeof value === "function") return (value as (s: BreakpointState) => UiChild)(state)

    return value
  }

  private widthOf(name: string): number {
    return this.points.find(([candidate]) => candidate === name)?.[1] ?? 0
  }

  private state(): BreakpointState {
    return { name: this.current(), width: this.windowWidth }
  }

  private publish(): void {
    const state = this.state()

    this.app.store.set(this.key, state)

    for (const listener of this.listeners) listener(state)
  }
}

export const createBreakpoints = (
  app: App,
  points: BreakpointPoints = DEFAULT_POINTS,
  options: BreakpointsOptions = {},
): Breakpoints => {
  return new Breakpoints(app, points, options)
}

/** Pick a UI branch for a breakpoints instance (same as `breakpoints.view`). */
export const responsive = (breakpoints: Breakpoints, values: Record<string, BreakpointValue>): UiChild => {
  return breakpoints.view(values)
}
