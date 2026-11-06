import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import type { AppManifest } from "../core/sdk/manifest.ts"
import { appFiles } from "./android.ts"
import { createIgnoreFilter } from "./ignore.ts"

const withApp = (files: Record<string, string>, run: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), "pulsar-ignore-"))

  try {
    for (const [path, data] of Object.entries(files)) {
      const abs = join(dir, path)

      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, data)
    }

    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("createIgnoreFilter", () => {
  test("always skips build noise and local secrets", () => {
    withApp({}, (dir) => {
      const ignore = createIgnoreFilter(dir, null)

      expect(ignore.ignored(".env")).toBe(true)
      expect(ignore.ignored(".env.production")).toBe(true)
      expect(ignore.ignored("sync.db")).toBe(true)
      expect(ignore.ignored("sync.db-wal")).toBe(true)
      expect(ignore.ignored("node_modules/pkg/index.js")).toBe(true)
      expect(ignore.ignored("dist/app")).toBe(true)
      expect(ignore.ignored(".git/config")).toBe(true)
      expect(ignore.ignored("src/main.ts")).toBe(false)
      expect(ignore.ignored("app.env")).toBe(false)
    })
  })

  test("defaults cannot be re-included", () => {
    withApp({ ".gitignore": "!node_modules\n!sync.db\n" }, (dir) => {
      const ignore = createIgnoreFilter(dir, { ignore: ["!node_modules", "!sync.db"] })

      expect(ignore.ignored("node_modules/x")).toBe(true)
      expect(ignore.ignored("sync.db")).toBe(true)
    })
  })

  test("reads .gitignore patterns, negation and anchoring", () => {
    withApp({ ".gitignore": "*.log\n/private\nnested/**\n!keep.log\n" }, (dir) => {
      const ignore = createIgnoreFilter(dir, null)

      expect(ignore.ignored("debug.log")).toBe(true)
      expect(ignore.ignored("sub/debug.log")).toBe(true)
      expect(ignore.ignored("keep.log")).toBe(false)
      expect(ignore.ignored("private/secret.txt")).toBe(true)
      expect(ignore.ignored("sub/private/secret.txt")).toBe(false)
      expect(ignore.ignored("nested/a/b.txt")).toBe(true)
      expect(ignore.ignored("sub/nested/a.txt")).toBe(false)
    })
  })

  test("directory patterns match directories and their contents only", () => {
    withApp({ ".gitignore": "data/\n!data/keep.txt\n" }, (dir) => {
      const ignore = createIgnoreFilter(dir, null)

      expect(ignore.ignored("data/x", false)).toBe(true)
      expect(ignore.ignored("data", true)).toBe(true)
      expect(ignore.ignored("x/data", false)).toBe(false)
      expect(ignore.ignored("x/data/t", false)).toBe(true)
    })
  })

  test("honours manifest ignore patterns", () => {
    const manifest: AppManifest = { ignore: ["*.png", "tmp/"] }

    withApp({}, (dir) => {
      const ignore = createIgnoreFilter(dir, manifest)

      expect(ignore.ignored("a.png")).toBe(true)
      expect(ignore.ignored("ui/a.png")).toBe(true)
      expect(ignore.ignored("tmp/x")).toBe(true)
      expect(ignore.ignored("a.txt")).toBe(false)
    })
  })

  test("manifest patterns can re-include a path ignored by .gitignore", () => {
    const manifest: AppManifest = { ignore: ["!logo.png"] }

    withApp({ ".gitignore": "*.png\n" }, (dir) => {
      const ignore = createIgnoreFilter(dir, manifest)

      expect(ignore.ignored("logo.png")).toBe(false)
      expect(ignore.ignored("icon.png")).toBe(true)
    })
  })
})

describe("appFiles with ignore rules", () => {
  test("drops gitignored files, manifest patterns and secrets", () => {
    withApp(
      {
        ".gitignore": "secret.txt\n",
        ".env": "TOKEN=1\n",
        "main.ts": "export {}",
        "pulsar.json": "{}",
        "secret.txt": "shh",
        "ui/logo.png": "png",
        "ui/main.qml": "Item {}",
      },
      (dir) => {
        const manifest: AppManifest = { ignore: ["*.png"] }

        expect(appFiles(dir, manifest).sort()).toEqual([".gitignore", "main.ts", "pulsar.json", "ui/main.qml"])
      },
    )
  })
})
