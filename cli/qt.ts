import { spawnSync } from "child_process"
import { existsSync, readFileSync, readdirSync } from "fs"
import { join } from "path"

export type PayloadEntry = { path: string; data: Buffer }
export type QtFile = { rel: string; src: string }

function qmakeQuery(key: string): string | undefined {
  for (const qmake of [process.env.PULSAR_QMAKE, "qmake6", "qmake"]) {
    if (!qmake) continue
    const r = spawnSync(qmake, ["-query", key], { encoding: "utf8" })
    if (r.status === 0 && r.stdout) {
      const value = r.stdout.trim()
      if (value) return value
    }
  }
  return undefined
}

/** Resolved shared libraries the host actually links, via ldd. */
function neededLibs(hostPath: string): string[] {
  const r = spawnSync("ldd", [hostPath], { encoding: "utf8" })
  const paths: string[] = []
  for (const line of (r.stdout ?? "").split("\n")) {
    const match = line.match(/=>\s+(\/\S+)/)
    if (match?.[1]) paths.push(match[1])
  }
  return paths
}

function addTree(files: QtFile[], fromDir: string, prefix: string): void {
  if (!existsSync(fromDir)) return
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(abs, relPath)
      else if (entry.isFile()) files.push({ rel: `${prefix}/${relPath}`, src: abs })
    }
  }
  walk(fromDir, "")
}

export function qtConfText(): string {
  return ["[Paths]", "Prefix=..", "Plugins=lib/Qt/plugins", "QmlImports=lib/Qt/qml", ""].join("\n")
}

/**
 * The Qt runtime files to ship: only the libraries the host links (via ldd),
 * the platform/image plugins and the QML modules typical apps import.
 * Returns null when Qt is not discoverable (qmake missing).
 */
export function qtFiles(hostPath: string): QtFile[] | null {
  const libsDir = qmakeQuery("QT_INSTALL_LIBS")
  const pluginsDir = qmakeQuery("QT_INSTALL_PLUGINS")
  const qmlDir = qmakeQuery("QT_INSTALL_QML")
  if (!libsDir || !existsSync(libsDir)) return null

  const files: QtFile[] = []
  const seen = new Set<string>()

  // Copy Qt (and ICU) libraries, deduplicated.
  const addLib = (lib: string) => {
    const name = lib.split("/").pop() ?? ""
    if (!existsSync(lib)) return
    if (!(lib.startsWith(libsDir) || /^libicu/.test(name)) || seen.has(name)) return
    seen.add(name)
    files.push({ rel: `lib/Qt/lib/${name}`, src: lib })
  }

  for (const lib of neededLibs(hostPath)) addLib(lib)

  // Platform/image plugins, plus the Qt libraries *they* link (e.g.
  // libQt6WaylandClient / libQt6XcbQpa), which the host does not link itself.
  if (pluginsDir) {
    const groups = [
      "platforms",
      "imageformats",
      "iconengines",
      "xcbglintegrations",
      "generic",
      "platformthemes",
      "platforminputcontexts",
      "wayland-shell-integration",
      "wayland-graphics-integration-client",
      "wayland-decoration-client",
    ]
    for (const group of groups) {
      const groupFiles: QtFile[] = []
      addTree(groupFiles, join(pluginsDir, group), `lib/Qt/plugins/${group}`)
      files.push(...groupFiles)
      for (const file of groupFiles) {
        if (file.src.endsWith(".so")) for (const dep of neededLibs(file.src)) addLib(dep)
      }
    }
  }

  // QML modules used by typical apps.
  if (qmlDir) {
    for (const module of ["QtQuick", "QtQml"]) addTree(files, join(qmlDir, module), `lib/Qt/qml/${module}`)
  }
  return files
}

/**
 * Bundle the system Qt runtime into the payload and add a qt.conf pointing at
 * it, so the app never depends on a system Qt. Best-effort.
 */
export function collectQt(entries: PayloadEntry[], hostPath: string): boolean {
  const files = qtFiles(hostPath)
  if (!files) {
    console.warn("pulsar: Qt not found (qmake); building a slim app that needs a system Qt")
    return false
  }
  for (const file of files) entries.push({ path: file.rel, data: readFileSync(file.src) })
  entries.push({ path: "bin/qt.conf", data: Buffer.from(qtConfText(), "utf8") })

  const mb = files.reduce((sum, file) => sum + readFileSync(file.src).length, 0) / (1024 * 1024)
  console.log(`pulsar: bundled Qt (~${mb.toFixed(0)} MB)`)
  return true
}
