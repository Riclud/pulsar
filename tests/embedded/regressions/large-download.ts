import { App, net, paths, type NetError } from "../../../core/sdk/index.ts"

declare const __pulsarEnv: (name: string) => string

const app = new App()
const url = __pulsarEnv("PULSAR_TEST_URL")

const run = async () => {
  const { cache } = await paths.get()
  const started = Date.now()
  const result = await net.download(url, `${cache}/large-download.bin`)

  console.log(`DOWNLOAD_DONE ${result.bytes} in ${Date.now() - started} ms`)

  const slow = await net.download(`${url}/slow`, `${cache}/slow-download.bin`, { timeoutMs: 300 })

  console.log(`SLOW_DONE ${slow.bytes}`)

  await net.fetch(url, { responseType: "binary" }).catch((error: NetError) => {
    console.log(`FETCH_LIMITED ${error.code}`)
  })

  app.quit()
}

void run()
