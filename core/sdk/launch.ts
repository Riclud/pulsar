export interface LaunchArgs {
  urls: string[]
  files: string[]
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

const isAbsolute = (path: string): boolean => {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)
}

const resolvePath = (cwd: string, path: string): string => {
  if (isAbsolute(path)) return path

  const separator = cwd.endsWith("/") || cwd.endsWith("\\") ? "" : "/"

  return cwd + separator + path
}

const fileUrlPath = (url: string): string => {
  const rest = url.slice("file://".length)

  let path = rest

  try {
    path = decodeURIComponent(rest)
  } catch {}

  if (/^\/[a-zA-Z]:\//.test(path)) path = path.slice(1)

  return path
}

/**
 * Split the process arguments the OS handed the app into URLs (deep links) and
 * file paths. The first argument is the program itself and is ignored, as are
 * options (anything starting with `-`). Relative paths resolve against `cwd`.
 */
export const parseLaunchArgs = (argv: string[], cwd: string): LaunchArgs => {
  const urls: string[] = []
  const files: string[] = []

  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith("-")) continue

    const scheme = SCHEME.exec(arg)?.[1]?.toLowerCase()

    if (scheme === "file") {
      files.push(fileUrlPath(arg))
      continue
    }

    if (scheme && scheme.length > 1) {
      urls.push(arg)
      continue
    }

    files.push(resolvePath(cwd, arg))
  }

  return { urls, files }
}
