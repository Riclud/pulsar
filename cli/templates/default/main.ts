import { App } from "pulsar"

const app = new App()

app.store.set("greeting", "Hello from Pulsar")

app.on("greet", (params: { name: string }) => {
  app.store.set("greeting", `Hello, ${params.name}!`)
})

app.run()
