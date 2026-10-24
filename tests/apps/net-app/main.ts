import { App, net } from "../../../core/sdk/index.ts"

const base = process.env.PULSAR_NET_BASE ?? "http://127.0.0.1:9"
const app = new App()

const errorCode = (e: unknown): string => (e as { code?: string }).code ?? ""

const run = async () => {
  const text = await net.fetch(`${base}/hello`)
  app.store.set("netText", text.text === "hello pulsar")

  const echo = await net.fetch(`${base}/echo`, {
    method: "POST",
    headers: { "X-Test": "yes" },
    body: "payload",
  })
  const echoed = JSON.parse(echo.text) as { method: string; body: string; header: string }
  app.store.set("netEcho", echoed.method === "POST" && echoed.body === "payload" && echoed.header === "yes")

  const binary = await net.fetch(`${base}/binary`, { responseType: "binary" })
  app.store.set("netBinary", Array.from(binary.bytes ?? []).join(",") === "0,1,2,255")

  const redirect = await net.fetch(`${base}/redirect`)
  app.store.set("netRedirect", redirect.text === "hello pulsar")

  const manual = await net.fetch(`${base}/redirect`, { redirect: "manual" })
  app.store.set("netManual", manual.status === 302)

  const streamed = await new Promise<string>((resolve, reject) => {
    const request = net.request(`${base}/chunks`)
    let body = ""

    request.on("data", (chunk) => {
      if (typeof chunk === "string") body += chunk
    })
    request.on("end", () => resolve(body))
    request.on("error", (error) => reject(new Error(error.code)))
  })
  app.store.set("netStream", streamed === "abcdef")

  try {
    await net.fetch(`${base}/slow`, { timeoutMs: 40 })
    app.store.set("netTimeout", false)
  } catch (e) {
    app.store.set("netTimeout", errorCode(e) === "ERR_TIMEOUT")
  }

  const aborted = await new Promise<boolean>((resolve) => {
    const request = net.request(`${base}/slow`)
    request.on("error", (error) => resolve(error.code === "ERR_ABORTED"))
    request.on("end", () => resolve(false))
    setTimeout(() => request.abort(), 10)
  })
  app.store.set("netAbort", aborted)

  try {
    await net.fetch(`${base}/hello`, { tlsFingerprint: true })
    app.store.set("netFingerprint", false)
  } catch (e) {
    app.store.set("netFingerprint", errorCode(e) === "ERR_FINGERPRINT_UNAVAILABLE")
  }

  app.store.set("netOk", true)
}

void run().catch((e) => {
  app.store.set("netError", e instanceof Error ? e.message : String(e))
  app.store.set("netOk", false)
})

app.run()
