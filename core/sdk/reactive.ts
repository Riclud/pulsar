let active: Computation | null = null

export class Source {
  private readonly subscribers = new Set<Computation>()

  track(): void {
    if (!active) return

    this.subscribers.add(active)
    active.sources.add(this)
  }

  trigger(): void {
    for (const subscriber of [...this.subscribers]) subscriber.invalidate()
  }

  remove(computation: Computation): void {
    this.subscribers.delete(computation)
  }
}

export class Computation {
  readonly sources = new Set<Source>()

  constructor(private readonly onInvalidate: () => void) {}

  run<T>(fn: () => T): T {
    const previous = active

    this.clear()
    active = this

    try {
      return fn()
    } finally {
      active = previous
    }
  }

  invalidate(): void {
    this.onInvalidate()
  }

  clear(): void {
    for (const source of this.sources) source.remove(this)

    this.sources.clear()
  }
}

export interface Signal<T> {
  get(): T
  set(value: T): void
  /** Read without subscribing the current render or effect. */
  peek(): T
}

export interface Computed<T> {
  get(): T
  peek(): T
}

export const signal = <T>(initial: T): Signal<T> => {
  const source = new Source()

  let value = initial

  return {
    get: () => {
      source.track()

      return value
    },
    set: (next) => {
      if (Object.is(value, next)) return

      value = next
      source.trigger()
    },
    peek: () => value,
  }
}

export const computed = <T>(read: () => T): Computed<T> => {
  const source = new Source()

  let stale = true
  let value: T

  const computation = new Computation(() => {
    if (stale) return

    stale = true
    source.trigger()
  })

  const refresh = (): T => {
    if (!stale) return value

    value = computation.run(read)
    stale = false

    return value
  }

  return {
    get: () => {
      source.track()

      return refresh()
    },
    peek: () => refresh(),
  }
}

const pendingEffects = new Set<() => void>()

let effectsQueued = false

const flushEffects = (): void => {
  effectsQueued = false

  const effects = [...pendingEffects]

  pendingEffects.clear()

  for (const run of effects) run()
}

/** Run now and again after anything it read changes; returns a stop function. */
export const effect = (fn: () => void): (() => void) => {
  const run = (): void => {
    computation.run(fn)
  }

  const computation = new Computation(() => {
    pendingEffects.add(run)

    if (effectsQueued) return

    effectsQueued = true
    queueMicrotask(flushEffects)
  })

  run()

  return () => {
    pendingEffects.delete(run)
    computation.clear()
  }
}

export const untracked = <T>(fn: () => T): T => {
  const previous = active

  active = null

  try {
    return fn()
  } finally {
    active = previous
  }
}

/** A plain-looking object whose fields are tracked when read in a render or effect. */
export const createState = <T extends object>(initial: T): T => {
  const state = {} as T

  for (const key of Object.keys(initial) as Array<keyof T>) {
    const field = signal(initial[key])

    Object.defineProperty(state, key, {
      enumerable: true,
      get: () => field.get(),
      set: (value: T[keyof T]) => field.set(value),
    })
  }

  return state
}
