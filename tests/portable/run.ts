import { createRuntime } from "../../core/runtime/core.ts"
import { run } from "./app.ts"
import { createMemoryPlatform } from "./platform.ts"
import { createFakeTransport } from "./transport.ts"

const transport = createFakeTransport()

const runtime = createRuntime({
  transport,
  platform: createMemoryPlatform(),
  manifest: { id: "com.pulsar.portable", windows: [] },
  info: { name: "quickjs", version: "test" },
})

runtime.start()
runtime.wireApp()

const ok = await run()

console.log("PORTABLE_RESULT", ok)
