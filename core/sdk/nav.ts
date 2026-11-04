import { signal } from "./reactive.ts"
import type { App } from "./app.ts"
import type { UiChild } from "./ui.ts"

export interface Route {
  name: string
  params?: Record<string, unknown>
}

export interface RouterState extends Route {
  canGoBack: boolean
  depth: number
}

export type RouterScreen = (params: Record<string, unknown>) => UiChild

export interface RouterOptions {
  initial?: Route | string
  /** Store key the current route is published under (default "route"). */
  storeKey?: string
  /** Pop on the system back button and quit when the stack is empty. */
  handleBack?: boolean
}

const normalizeRoute = (route: Route | string): Route => {
  return typeof route === "string" ? { name: route } : { name: route.name, params: route.params }
}

/**
 * A small screen stack for pull-rendered apps. Push/pop publish the current
 * route to the store (under `storeKey`) so UI bindings re-render, and the
 * system back button pops the stack.
 */
export class Router {
  private readonly changes = signal(0)
  private readonly stack: Route[]
  private readonly listeners = new Set<(state: RouterState) => void>()
  private readonly storeKey: string

  constructor(
    private readonly app: App,
    options: RouterOptions = {},
  ) {
    this.stack = [normalizeRoute(options.initial ?? "home")]
    this.storeKey = options.storeKey ?? "route"

    this.publish()

    if (options.handleBack !== false) {
      this.app.on("back-pressed", () => {
        if (!this.pop()) this.app.quit()
      })
    }
  }

  /** Current route. */
  current(): Route {
    this.changes.get()

    return this.stack[this.stack.length - 1]!
  }

  /** The full stack, oldest first. */
  entries(): Route[] {
    return [...this.stack]
  }

  canGoBack(): boolean {
    return this.stack.length > 1
  }

  depth(): number {
    return this.stack.length
  }

  push(name: string, params?: Record<string, unknown>): this {
    this.stack.push({ name, params })
    this.publish()

    return this
  }

  replace(name: string, params?: Record<string, unknown>): this {
    this.stack[this.stack.length - 1] = { name, params }
    this.publish()

    return this
  }

  /** Pop one screen; returns false when already at the root. */
  pop(): boolean {
    if (this.stack.length <= 1) return false

    this.stack.pop()
    this.publish()

    return true
  }

  reset(name = "home", params?: Record<string, unknown>): this {
    this.stack.length = 0
    this.stack.push({ name, params })
    this.publish()

    return this
  }

  subscribe(listener: (state: RouterState) => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  /** Pick the UI for the current route from a name -> screen map. */
  view(screens: Record<string, RouterScreen | UiChild>): UiChild {
    const route = this.current()
    const screen = screens[route.name]

    if (screen === undefined || screen === null) return null
    if (typeof screen === "function") return screen(route.params ?? {})

    return screen
  }

  private state(): RouterState {
    const route = this.current()

    return {
      name: route.name,
      params: route.params ?? {},
      canGoBack: this.canGoBack(),
      depth: this.stack.length,
    }
  }

  private publish(): void {
    this.changes.set(this.changes.peek() + 1)

    const state = this.state()

    this.app.store.set(this.storeKey, state)

    for (const listener of this.listeners) listener(state)
  }
}

export const createRouter = (app: App, options: RouterOptions = {}): Router => {
  return new Router(app, options)
}
