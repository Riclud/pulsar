import { App, net } from "../../../core/sdk/index.ts"

const app = new App()

const environment = globalThis as { process?: { env?: Record<string, string | undefined> } }
const base = environment.process?.env?.PULSAR_NET_BASE ?? "http://127.0.0.1:8787"

const report = async (): Promise<void> => {
  try {
    const text = await net.fetch(`${base}/text`)

    app.store.set("text", text.text)

    const binary = await net.fetch(`${base}/bin`, { responseType: "binary" })
    const bytes = binary.bytes ?? new Uint8Array()

    app.store.set("binary", `${bytes.byteLength}:${[...bytes].join(",")}`)
    console.log(`net: text="${text.text}" binary=${bytes.byteLength}`)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)

    app.store.set("error", message)
    console.log(`net: failed ${message}`)
  }
}

app.on("refresh", () => {
  void report()
})

void report()
