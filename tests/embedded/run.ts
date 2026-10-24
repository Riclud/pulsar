import { createRuntime } from "../../core/runtime/core.ts"
import { createEmbeddedTransport } from "../../core/runtime/quickjs_transport.ts"
import { createQuickJsPlatform } from "../../core/platform/quickjs.ts"
import { App, fs, paths, storage } from "../../core/sdk/index.ts"

declare const __pulsarManifest: string
declare const __pulsarSend: (json: string) => void

const manifest = JSON.parse(__pulsarManifest ?? "null")

try {
  const runtime = createRuntime({
    transport: createEmbeddedTransport(),
    platform: createQuickJsPlatform(),
    manifest,
    info: { name: "quickjs", version: "test" },
  })

  runtime.start()

  const app = new App()

  runtime.wireApp()

  void (async () => {
    try {
      const dirs = await paths.get()

      await storage.set("k", { n: 7 })
      await fs.writeFile(dirs.data + "/note.txt", "hello native")

      const text = await fs.readFile(dirs.data + "/note.txt")
      const value = (await storage.get("k")) as { n?: number } | undefined

      __pulsarSend(JSON.stringify({ method: "RESULT", ok: text === "hello native" && value?.n === 7 }))
    } catch (e) {
      __pulsarSend(JSON.stringify({ method: "ERROR", message: e instanceof Error ? e.stack : String(e) }))
    }
  })()
} catch (e) {
  __pulsarSend(JSON.stringify({ method: "ERROR", message: e instanceof Error ? e.stack : String(e) }))
}
