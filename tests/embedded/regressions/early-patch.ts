import { createQuickJsPlatform } from "../../../core/platform/quickjs.ts"
import { createRuntime } from "../../../core/runtime/core.ts"
import { createEmbeddedTransport } from "../../../core/runtime/quickjs_transport.ts"
import { App, Column, Text } from "../../../core/sdk/index.ts"

const runtime = createRuntime({
  transport: createEmbeddedTransport(),
  platform: createQuickJsPlatform(),
  manifest: null,
  info: { name: "quickjs", version: "test" },
})

runtime.start()

const app = new App()

runtime.wireApp()

app.store.set("value", "first")

app.window("main").render(() => {
  return Column({ key: "root" }, Text({ text: String(app.store.get("value")) }))
})

void Promise.resolve().then(() => app.store.set("value", "second"))
