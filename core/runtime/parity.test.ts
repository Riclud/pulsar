import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join, resolve } from "path"

const root = resolve(import.meta.dir, "..", "..")

const read = (...files: string[]) => {
  return files.map((file) => readFileSync(join(root, file), "utf8")).join("\n")
}

const matches = (text: string, pattern: RegExp) => {
  return new Set([...text.matchAll(pattern)].map((match) => match[1]!))
}

const runtimeSource = read("core/runtime/core.ts", "core/runtime/framing.ts", "core/sdk/net.ts", "core/sdk/app.ts")
const desktopSource = read("host/main.cpp", "host/bridge.cpp", "host/crypto.h")
const embeddedSource = read("host/embedded/bridge.cpp", "host/crypto.h")
const hostMethodPattern = /"(__[a-z-]+)"/g

const runtimeMethods = matches(runtimeSource, /method: "(__[a-z-]+)"/g)
const runtimeQueries = matches(runtimeSource, /hostQuery\("([a-zA-Z.]+)"/g)
const queryPattern = /kind == QLatin1String\("([a-zA-Z.]+)"\)/g

const desktopOnly = ["__menu", "__recent", "__tray", "__reload"]
const androidOnly = ["__notify-channel", "__toast"]
const appliedFromAnyDesktopNotification = ["__state"]
const queriesWithoutEmbeddedSupport = ["system.power"]

const missing = (wanted: Set<string>, handled: Set<string>, allowed: string[]) => {
  return [...wanted].filter((name) => !handled.has(name) && !allowed.includes(name)).sort()
}

describe("protocol parity", () => {
  test("the desktop host handles what the runtime sends", () => {
    expect(
      missing(runtimeMethods, matches(desktopSource, hostMethodPattern), [
        ...androidOnly,
        ...appliedFromAnyDesktopNotification,
      ]),
    ).toEqual([])
  })

  test("the embedded host handles what the runtime sends", () => {
    expect(missing(runtimeMethods, matches(embeddedSource, hostMethodPattern), desktopOnly)).toEqual([])
  })

  test("the desktop host answers every query", () => {
    expect(missing(runtimeQueries, matches(desktopSource, queryPattern), [])).toEqual([])
  })

  test("the embedded host answers every supported query", () => {
    const handled = matches(embeddedSource, queryPattern)

    expect(missing(runtimeQueries, handled, queriesWithoutEmbeddedSupport)).toEqual([])
  })

  test("the runtime handles what the hosts send", () => {
    const sent = matches(
      read("host/main.cpp", "host/bridge.cpp", "host/embedded/bridge.cpp", "host/embedded/main.cpp"),
      /(?:reply|notify|notifyMethod)\(\s*QStringLiteral\("(__[a-z-]+)"\)/g,
    )
    const handled = matches(read("core/runtime/core.ts"), /req\.method === "(__[a-z-]+)"/g)

    expect(sent.size).toBeGreaterThan(0)
    expect(missing(sent, handled, [])).toEqual([])
  })
})
