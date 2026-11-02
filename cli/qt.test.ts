import { describe, expect, test } from "bun:test"
import { spawnSync } from "child_process"
import { existsSync, readdirSync } from "fs"
import { join } from "path"
import { qtFiles } from "./qt.ts"

const qmakeQuery = (key: string): string | undefined => {
  for (const qmake of ["qmake6", "qmake"]) {
    const r = spawnSync(qmake, ["-query", key], { encoding: "utf8" })

    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }

  return undefined
}

const walk = (dir: string): string[] => {
  const out: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) out.push(...walk(path))
    else if (entry.name.endsWith(".so")) out.push(path)
  }

  return out
}

const needed = (file: string): string[] => {
  const r = spawnSync("readelf", ["-d", file], { encoding: "utf8" })
  const names: string[] = []

  for (const line of r.stdout.split("\n")) {
    const match = line.match(/\[(lib[^\]]+\.so[^\]]*)\]/)

    if (match?.[1]) names.push(match[1])
  }

  return names
}

const linux = process.platform === "linux"
const qmlDir = linux ? qmakeQuery("QT_INSTALL_QML") : undefined
const libsDir = linux ? qmakeQuery("QT_INSTALL_LIBS") : undefined
const hasQt = Boolean(qmlDir && libsDir && existsSync(qmlDir) && existsSync(libsDir))

describe("linux Qt bundle", () => {
  test.skipIf(!hasQt)("includes the Qt libraries needed by QML modules", () => {
    const files = qtFiles("/nonexistent/qml-host")

    expect(files).not.toBeNull()

    const bundled = new Set(files!.map((file) => file.rel.split("/").pop()))

    for (const module of ["QtQuick", "QtQml"]) {
      const dir = join(qmlDir!, module)

      if (!existsSync(dir)) continue

      for (const plugin of walk(dir)) {
        for (const lib of needed(plugin)) {
          if (!lib.startsWith("libQt6") || !existsSync(join(libsDir!, lib))) continue

          expect(bundled.has(lib)).toBe(true)
        }
      }
    }
  })
})
