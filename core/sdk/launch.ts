import { resolve } from "path"
import { fileURLToPath } from "url"

export interface LaunchArgs {
  urls: string[]
  files: string[]
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

const toFilePath = (url: string): string => {
  try {
    return fileURLToPath(url)
  } catch {
    return url
  }
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
      files.push(toFilePath(arg))
      continue
    }

    if (scheme && scheme.length > 1) {
      urls.push(arg)
      continue
    }

    files.push(resolve(cwd, arg))
  }

  return { urls, files }
}
