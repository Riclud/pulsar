import { assertSerializable } from "../sdk/app.ts"
import type { Platform } from "../platform.ts"
import type { CapRegistry } from "../sdk/index.ts"

const FILE = "storage.json"

/**
 * JSON key/value store in the app data directory. All operations are
 * serialized so concurrent read-modify-write calls cannot lose updates.
 */
export const createStorageCaps = (platform: Platform): CapRegistry => {
  let queue: Promise<unknown> = Promise.resolve()

  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn)

    queue = run.then(
      () => undefined,
      () => undefined,
    )

    return run
  }

  const storePath = async (): Promise<string> => {
    const paths = await platform.paths()

    return paths.data + "/" + FILE
  }

  const parseStore = (text: string): Record<string, unknown> | null => {
    try {
      const data: unknown = JSON.parse(text)

      if (typeof data !== "object" || data === null || Array.isArray(data)) return null

      return data as Record<string, unknown>
    } catch {
      return null
    }
  }

  const readStore = async (): Promise<Record<string, unknown>> => {
    const path = await storePath()

    if (!(await platform.exists(path))) return {}

    const data = parseStore(await platform.readFile(path, "utf8"))

    if (data) return data

    const backup = `${path}.corrupt-${Date.now()}`

    await platform.rename(path, backup)

    console.error(`[pulsar] storage is corrupted; moved it to ${backup}`)

    return {}
  }

  const writeStore = async (data: Record<string, unknown>): Promise<void> => {
    await platform.writeFileAtomic(await storePath(), JSON.stringify(data, null, 2), "utf8")
  }

  return {
    "storage.get": (p: { key: string }) => serial(async () => (await readStore())[p.key]),

    "storage.has": (p: { key: string }) => serial(async () => p.key in (await readStore())),

    "storage.set": (p: { key: string; value: unknown }) =>
      serial(async () => {
        assertSerializable(p.value, p.key)

        const data = await readStore()

        data[p.key] = p.value
        await writeStore(data)

        return true
      }),

    "storage.setMany": (p: { values: Record<string, unknown> }) =>
      serial(async () => {
        for (const [key, value] of Object.entries(p.values)) assertSerializable(value, key)

        await writeStore({ ...(await readStore()), ...p.values })

        return true
      }),

    "storage.remove": (p: { key: string }) =>
      serial(async () => {
        const data = await readStore()

        if (!(p.key in data)) return false

        delete data[p.key]
        await writeStore(data)

        return true
      }),
  }
}
