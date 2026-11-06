import { spawnSync } from "child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from "fs"
import { tmpdir } from "os"
import { basename, dirname, join, resolve } from "path"
import { pulsarRoot } from "./core.ts"
import { ui } from "./ui.ts"

export type PayloadEntry = {
  path: string
  data: Buffer
}
export type QtFile = {
  rel: string
  src: string
}

const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"

const PLUGIN_GROUPS = [
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
  "multimedia",
  "networkinformation",
  "tls",
]

const QML_MODULES = ["QtQuick", "QtQml", "QtMultimedia"]

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

const isExcludedLib = (name: string) => {
  return EXCLUDED_LIB_PREFIXES.some((prefix) => name.startsWith(prefix))
}

const isSystemLib = (path: string) => {
  return path.startsWith("/usr/lib") || path.startsWith("/System/") || path.startsWith("/lib")
}

const qmakeQuery = (key: string) => {
  for (const qmake of [process.env.PULSAR_QMAKE, "qmake6", "qmake"]) {
    if (!qmake) continue

    const r = spawnSync(qmake, ["-query", key], { encoding: "utf8" })

    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim()
  }

  return undefined
}

const neededLibs = (file: string) => {
  const r = spawnSync("ldd", [file], { encoding: "utf8" })
  const paths: string[] = []

  for (const line of (r.stdout ?? "").split("\n")) {
    const match = line.match(/=>\s+(\/\S+)/)

    if (match?.[1]) paths.push(match[1])
  }

  return paths
}

const appleDeps = (file: string, libsDir: string) => {
  const r = spawnSync("otool", ["-L", file], { encoding: "utf8" })
  const paths: string[] = []

  for (const line of (r.stdout ?? "").split("\n").slice(1)) {
    const raw = line.trim().split(" ")[0]

    if (!raw) continue

    if (raw.startsWith("@rpath/")) paths.push(join(libsDir, raw.slice("@rpath/".length)))
    else if (raw.startsWith("/")) paths.push(raw)
  }

  return paths
}

const addTree = (files: QtFile[], fromDir: string, prefix: string) => {
  if (!existsSync(fromDir)) return

  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      const linkDir = entry.isSymbolicLink() && existsSync(abs) && statSync(abs).isDirectory()

      if (entry.isDirectory() || linkDir) {
        walk(abs, relPath)
        continue
      }

      if (entry.isFile() || entry.isSymbolicLink()) files.push({ rel: `${prefix}/${relPath}`, src: abs })
    }
  }

  walk(fromDir, "")
}

export const qtConfText = (): string => {
  if (isWindows) return ["[Paths]", "Plugins=plugins", "QmlImports=qml", ""].join("\n")

  return ["[Paths]", "Prefix=..", "Plugins=lib/Qt/plugins", "QmlImports=lib/Qt/qml", ""].join("\n")
}

const bundledQtRoot = (hostPath: string) => {
  const fromEnv = process.env.PULSAR_QT_ROOT

  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const binDir = dirname(hostPath)

  if (isWindows) return existsSync(join(binDir, "Qt6Core.dll")) ? binDir : undefined

  const candidate = resolve(binDir, "..", "lib", "Qt")

  return existsSync(join(candidate, "lib")) ? candidate : undefined
}

const filesFromRoot = (root: string): QtFile[] => {
  const files: QtFile[] = []
  const seen = new Set<string>()

  if (isWindows) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile()) files.push({ rel: `bin/${entry.name}`, src: join(root, entry.name) })
    }

    addTree(files, join(root, "plugins"), "bin/plugins")
    addTree(files, join(root, "qml"), "bin/qml")

    return files
  }

  const libDir = join(root, "lib")

  if (existsSync(libDir)) {
    for (const entry of readdirSync(libDir, { withFileTypes: true })) {
      if (isExcludedLib(entry.name) || seen.has(entry.name)) continue

      seen.add(entry.name)
      files.push({ rel: `lib/Qt/lib/${entry.name}`, src: realpathSync(join(libDir, entry.name)) })
    }
  }

  addTree(files, join(root, "plugins"), "lib/Qt/plugins")
  addTree(files, join(root, "qml"), "lib/Qt/qml")

  return files
}

const linuxQtFiles = (
  hostPath: string,
  libsDir: string,
  pluginsDir: string,
  qmlDir: string,
  tools: string[],
): QtFile[] => {
  const files: QtFile[] = []
  const seen = new Set<string>()

  const addLib = (lib: string) => {
    if (!existsSync(lib)) return

    const real = realpathSync(lib)
    const name = lib.split("/").pop() ?? ""

    if (isExcludedLib(name)) return
    if (!(real.startsWith(libsDir) || /^libicu/.test(name)) || seen.has(name)) return

    seen.add(name)
    files.push({ rel: `lib/Qt/lib/${name}`, src: real })

    for (const dep of neededLibs(real)) addLib(dep)
  }

  for (const lib of neededLibs(hostPath)) addLib(lib)

  for (const tool of tools) {
    files.push({ rel: `lib/Qt/bin/${basename(tool)}`, src: tool })

    for (const lib of neededLibs(tool)) addLib(lib)
  }

  for (const group of PLUGIN_GROUPS) {
    const groupFiles: QtFile[] = []

    addTree(groupFiles, join(pluginsDir, group), `lib/Qt/plugins/${group}`)
    files.push(...groupFiles)

    for (const file of groupFiles) {
      if (file.src.endsWith(".so")) for (const dep of neededLibs(file.src)) addLib(dep)
    }
  }

  const qmlFiles: QtFile[] = []

  for (const module of QML_MODULES) addTree(qmlFiles, join(qmlDir, module), `lib/Qt/qml/${module}`)
  files.push(...qmlFiles)

  for (const file of qmlFiles) {
    if (file.src.endsWith(".so")) for (const dep of neededLibs(file.src)) addLib(dep)
  }

  return files
}

const appleQtFiles = (
  hostPath: string,
  libsDir: string,
  pluginsDir: string,
  qmlDir: string,
  tools: string[],
): QtFile[] => {
  const files: QtFile[] = []
  const seen = new Set<string>()

  const addDep = (path: string) => {
    if (!path.startsWith("/") || isSystemLib(path)) return

    const framework = path.match(/^(.*\.framework)\//)

    if (framework) {
      addFramework(framework[1]!)
      return
    }

    const name = path.split("/").pop() ?? ""

    if (!name || seen.has(name)) return

    seen.add(name)
    files.push({ rel: `lib/Qt/lib/${name}`, src: path })

    for (const dep of appleDeps(path, libsDir)) addDep(dep)
  }

  const addFramework = (fwPath: string) => {
    const name = fwPath.split("/").pop() ?? ""

    if (!name || seen.has(name)) return

    seen.add(name)

    const versionsDir = join(fwPath, "Versions")

    if (!existsSync(versionsDir)) {
      addTree(files, fwPath, `lib/Qt/lib/${name}`)

      for (const dep of appleDeps(join(fwPath, name), libsDir)) addDep(dep)

      return
    }

    const letter = readlinkSync(join(versionsDir, "Current"))
    const base = join(versionsDir, letter)

    addTree(files, base, `lib/Qt/lib/${name}/Versions/${letter}`)

    for (const dep of appleDeps(join(base, name.replace(/\.framework$/, "")), libsDir)) addDep(dep)
  }

  for (const lib of appleDeps(hostPath, libsDir)) addDep(lib)

  for (const tool of tools) {
    files.push({ rel: `lib/Qt/bin/${basename(tool)}`, src: tool })

    for (const lib of appleDeps(tool, libsDir)) addDep(lib)
  }

  for (const group of PLUGIN_GROUPS) {
    const groupFiles: QtFile[] = []

    addTree(groupFiles, join(pluginsDir, group), `lib/Qt/plugins/${group}`)
    files.push(...groupFiles)

    for (const file of groupFiles) {
      if (file.src.endsWith(".dylib")) for (const dep of appleDeps(file.src, libsDir)) addDep(dep)
    }
  }

  const qmlFiles: QtFile[] = []

  for (const module of QML_MODULES) addTree(qmlFiles, join(qmlDir, module), `lib/Qt/qml/${module}`)
  files.push(...qmlFiles)

  for (const file of qmlFiles) {
    if (file.src.endsWith(".dylib")) for (const dep of appleDeps(file.src, libsDir)) addDep(dep)
  }

  return files
}

const windowsQtFiles = (hostPath: string, tools: string[]): QtFile[] | null => {
  const binsDir = qmakeQuery("QT_INSTALL_BINS")
  const windeployqt = binsDir ? join(binsDir, "windeployqt.exe") : "windeployqt"
  const stage = mkdtempSync(join(tmpdir(), "pulsar-qt-"))
  const qmlRoot = join(pulsarRoot(), "host", "qml")
  const args = ["--release", "--no-translations", "--no-compiler-runtime", "--dir", stage]

  if (existsSync(qmlRoot)) args.push("--qmldir", qmlRoot)
  args.push(hostPath)

  const r = spawnSync(windeployqt, args, { stdio: "inherit" })

  if (r.status !== 0) return null

  const files: QtFile[] = []
  const seen = new Set<string>()

  const push = (file: QtFile) => {
    if (seen.has(file.rel)) return

    seen.add(file.rel)
    files.push(file)
  }

  const stageTree = (from: string, prefix: string) => {
    const tree: QtFile[] = []

    addTree(tree, from, prefix)

    for (const file of tree) push(file)
  }

  for (const entry of readdirSync(stage, { withFileTypes: true })) {
    if (entry.isFile()) {
      push({ rel: `bin/${entry.name}`, src: join(stage, entry.name) })
      continue
    }

    if (!entry.isDirectory()) continue

    if (entry.name === "qml") stageTree(join(stage, "qml"), "bin/qml")
    else if (entry.name === "plugins") stageTree(join(stage, "plugins"), "bin/plugins")
    else stageTree(join(stage, entry.name), `bin/plugins/${entry.name}`)
  }

  for (const tool of tools) {
    push({ rel: `bin/${basename(tool)}`, src: tool })

    const shaderTools = join(dirname(tool), "Qt6ShaderTools.dll")

    if (existsSync(shaderTools)) push({ rel: "bin/Qt6ShaderTools.dll", src: shaderTools })
  }

  return files
}

/** Paths of Qt command-line tools, such as qsb, found next to qmake. */
export const qtTools = (names: string[]): string[] => {
  const binsDir = qmakeQuery("QT_INSTALL_BINS")

  if (!binsDir) return []

  return names.map((name) => join(binsDir, isWindows ? `${name}.exe` : name)).filter((path) => existsSync(path))
}

export const qtFiles = (hostPath: string, tools: string[] = []): QtFile[] | null => {
  const root = bundledQtRoot(hostPath)

  if (root) return filesFromRoot(root)
  if (isWindows) return windowsQtFiles(hostPath, tools)

  const libsDir = qmakeQuery("QT_INSTALL_LIBS")
  const pluginsDir = qmakeQuery("QT_INSTALL_PLUGINS")
  const qmlDir = qmakeQuery("QT_INSTALL_QML")

  if (!libsDir || !existsSync(libsDir)) return null
  if (isMac) return appleQtFiles(hostPath, libsDir, pluginsDir ?? "", qmlDir ?? "", tools)

  return linuxQtFiles(hostPath, libsDir, pluginsDir ?? "", qmlDir ?? "", tools)
}

const UNUSED_STYLE =
  /QuickControls2(Imagine|Fusion|Universal|FluentWinUI3|IOS|MacOS|Windows)|QtQuick\/Controls\/(Imagine|Fusion|Universal|FluentWinUI3|iOS|macOS|Windows)\//
const SHADER_TOOLS = /ShaderTools|^lib\/Qt\/bin\/|^bin\/qsb\.exe$/
const VIDEO =
  /(^|\/)(lib)?(av(codec|format|util|device|filter)|sw(scale|resample))[-.]|\/plugins\/multimedia\/|\/qml\/QtMultimedia\//

/**
 * Whether a toolchain file belongs in an app. Apps never need the shader
 * compiler or the Controls styles Pulsar does not use, and they need FFmpeg
 * only when they play media.
 */
export const keepForApp = (rel: string, video: boolean): boolean => {
  if (SHADER_TOOLS.test(rel) || UNUSED_STYLE.test(rel)) return false

  return video || !VIDEO.test(rel)
}

export const collectQt = (entries: PayloadEntry[], hostPath: string, video = true): boolean => {
  const files = qtFiles(hostPath)?.filter((file) => keepForApp(file.rel, video))

  if (!files) {
    ui.warn("Qt not found (no bundled tree and qmake missing); building a slim app that needs a system Qt")
    return false
  }

  for (const file of files) entries.push({ path: file.rel, data: readFileSync(file.src) })
  entries.push({ path: "bin/qt.conf", data: Buffer.from(qtConfText(), "utf8") })

  const mb = files.reduce((sum, file) => sum + readFileSync(file.src).length, 0) / (1024 * 1024)

  ui.step(`bundled Qt (~${mb.toFixed(0)} MB)`)

  return true
}
