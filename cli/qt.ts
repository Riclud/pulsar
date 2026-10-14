import { spawnSync } from "child_process"
import { existsSync, readFileSync, readdirSync, realpathSync } from "fs"
import { dirname, join, resolve } from "path"

export type PayloadEntry = { path: string; data: Buffer }
export type QtFile = { rel: string; src: string }

// Libraries that must come from the host: the C runtime/loader plus the
// graphics stack, whose userspace drivers have to match the machine.
const EXCLUDED_LIB_PREFIXES = [
  "ld-linux",
  "ld.so",
  "libc.so",
  "libc_malloc_debug",
  "libm.so",
  "libmvec.so",
  "libpthread.so",
  "libdl.so",
  "librt.so",
  "libutil.so",
  "libanl.so",
  "libnsl.so",
  "libresolv.so",
  "libgcc_s.so",
  "libstdc++.so",
  "libGL.so",
  "libGLX",
  "libOpenGL",
  "libEGL",
  "libGLESv",
  "libGLdispatch",
  "libdrm",
  "libgbm",
  "libglapi",
  "libvulkan",
  "libxcb-dri",
  "libgallium",
  "libLLVM",
]

const isExcludedLib = (name: string): boolean => {
  return EXCLUDED_LIB_PREFIXES.some((prefix) => name.startsWith(prefix))
}

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

      if (entry.isDirectory()) {
        walk(abs, relPath)
        continue
      }

      if (entry.isFile()) {
        files.push({ rel: `${prefix}/${relPath}`, src: abs })
        continue
      }

      if (entry.isSymbolicLink() && existsSync(abs)) files.push({ rel: `${prefix}/${relPath}`, src: realpathSync(abs) })
    }
  }
  walk(fromDir, "")
}

export function qtConfText(): string {
  return ["[Paths]", "Prefix=..", "Plugins=lib/Qt/plugins", "QmlImports=lib/Qt/qml", ""].join("\n")
}

/**
 * A Qt tree that already sits next to the host (`PULSAR_QT_ROOT`, or
 * `<host>/../lib/Qt` inside an installed toolchain / extracted app). Reusing
 * it means `pulsar build` works on a machine without a system Qt.
 */
const bundledQtRoot = (hostPath: string): string | undefined => {
  const fromEnv = process.env.PULSAR_QT_ROOT
  if (fromEnv && existsSync(join(fromEnv, "lib"))) return fromEnv

  const candidate = resolve(dirname(hostPath), "..", "lib", "Qt")
  if (existsSync(join(candidate, "lib"))) return candidate

  return undefined
}

const filesFromRoot = (root: string): QtFile[] => {
  const files: QtFile[] = []
  const seen = new Set<string>()
  const libDir = join(root, "lib")

  if (existsSync(libDir)) {
    for (const entry of readdirSync(libDir, { withFileTypes: true })) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      if (isExcludedLib(entry.name) || seen.has(entry.name)) continue
      seen.add(entry.name)
      files.push({ rel: `lib/Qt/lib/${entry.name}`, src: realpathSync(join(libDir, entry.name)) })
    }
  }

  addTree(files, join(root, "plugins"), "lib/Qt/plugins")
  addTree(files, join(root, "qml"), "lib/Qt/qml")

  return files
}

/**
 * The Qt runtime files to ship: only the libraries the host links (via ldd),
 * the platform/image plugins and the QML modules typical apps import.
 * Returns null when Qt is not discoverable (no bundled tree and no qmake).
 */
export function qtFiles(hostPath: string): QtFile[] | null {
  const root = bundledQtRoot(hostPath)
  if (root) return filesFromRoot(root)

  const libsDir = qmakeQuery("QT_INSTALL_LIBS")
  const pluginsDir = qmakeQuery("QT_INSTALL_PLUGINS")
  const qmlDir = qmakeQuery("QT_INSTALL_QML")
  if (!libsDir || !existsSync(libsDir)) return null

  const files: QtFile[] = []
  const seen = new Set<string>()

  // Copy Qt (and ICU) libraries, deduplicated.
  const addLib = (lib: string) => {
    const name = lib.split("/").pop() ?? ""
    if (isExcludedLib(name)) return
    if (!existsSync(lib)) return
    if (!(lib.startsWith(libsDir) || /^libicu/.test(name)) || seen.has(name)) return
    seen.add(name)
    files.push({ rel: `lib/Qt/lib/${name}`, src: realpathSync(lib) })
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
    console.warn("pulsar: Qt not found (no bundled tree and qmake missing); building a slim app that needs a system Qt")
    return false
  }
  for (const file of files) entries.push({ path: file.rel, data: readFileSync(file.src) })
  entries.push({ path: "bin/qt.conf", data: Buffer.from(qtConfText(), "utf8") })

  const mb = files.reduce((sum, file) => sum + readFileSync(file.src).length, 0) / (1024 * 1024)
  console.log(`pulsar: bundled Qt (~${mb.toFixed(0)} MB)`)
  return true
}
