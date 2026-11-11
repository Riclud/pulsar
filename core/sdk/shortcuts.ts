import { sendUiCommand } from "./ui.ts"

export interface ShortcutOptions {
  /** Limit the shortcut to one window by its label; by default it works in every window of the app. */
  window?: string
  /** Fire again while the keys are held down; off by default. */
  repeat?: boolean
}

interface Registered {
  keys: string
  handler: () => void
  options: ShortcutOptions
}

const registered = new Map<number, Registered>()

let nextID = 1
let queued = false

/** `Mod` and `Cmd` mean Ctrl, which Qt maps to the Command key on macOS. */
export const normalizeKeys = (keys: string): string => {
  return keys
    .split("+")
    .map((part) => part.trim())
    .map((part) => {
      const lower = part.toLowerCase()

      if (lower === "mod" || lower === "cmd" || lower === "command" || lower === "control") return "Ctrl"
      if (lower === "option") return "Alt"
      if (lower === "esc") return "Escape"
      if (part.length === 1) return part.toUpperCase()

      return part
    })
    .join("+")
}

const send = (): void => {
  sendUiCommand({
    command: "shortcuts",
    shortcuts: [...registered.entries()].map(([id, entry]) => {
      return { id, keys: entry.keys, window: entry.options.window, repeat: entry.options.repeat }
    }),
  })
}

// One message per burst of registrations, such as a screen adding all its shortcuts when it opens.
const schedule = (): void => {
  if (queued) return

  queued = true

  void Promise.resolve().then(() => {
    queued = false
    send()
  })
}

/**
 * Keyboard shortcuts for the whole window, on the desktop. Keys are written like `Ctrl+K`,
 * `Ctrl+Shift+P`, `Alt+Left`, `F5` or `Escape`. A shortcut works wherever the focus is. One
 * with no Ctrl, Alt or Meta (a bare letter, Delete, Enter) is skipped while a text field has the
 * focus, so typing is not stolen.
 */
export const shortcuts = {
  /** Returns a function that removes the shortcut again. */
  register: (keys: string, handler: () => void, options: ShortcutOptions = {}): (() => void) => {
    const id = nextID++

    registered.set(id, { keys: normalizeKeys(keys), handler, options })
    schedule()

    return () => {
      if (!registered.delete(id)) return

      schedule()
    }
  },
}

export const shortcutInternals = {
  /** Runs the handler of a shortcut the host reported. */
  run: (id: number): void => registered.get(id)?.handler(),
  /** Sends the list again, for a host that connected after the app registered its shortcuts. */
  flush: (): void => {
    if (registered.size > 0) send()
  },
  reset: (): void => {
    registered.clear()
    queued = false
  },
}
