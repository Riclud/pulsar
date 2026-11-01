import { createRuntime } from "../../../core/runtime/core.ts"
import { createEmbeddedTransport } from "../../../core/runtime/quickjs_transport.ts"
import { createQuickJsPlatform } from "../../../core/platform/quickjs.ts"
import { App, Button, Column, Text } from "../../../core/sdk/index.ts"

declare const __pulsarManifest: string

const manifest = JSON.parse(__pulsarManifest ?? "null")
const runtime = createRuntime({
  transport: createEmbeddedTransport(),
  platform: createQuickJsPlatform(),
  manifest,
  info: { name: "quickjs", version: "test" },
})

runtime.start()

const app = new App()

runtime.wireApp()

app.window("main").render(() => Column({ padding: 16 }, Text({ text: "overlay fixture" }), Button({ label: "Boom" })))

setTimeout(() => {
  throw new Error("overlay test error")
}, 200)
