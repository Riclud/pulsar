import { App, fs, storage } from "../../core/sdk/index.ts"

const app = new App()

export const run = async (): Promise<boolean> => {
  await storage.set("portable", { n: 42 })

  const value = (await storage.get("portable")) as { n?: number } | undefined

  await fs.writeFile("/data/note.txt", "hello portable")

  const text = await fs.readFile("/data/note.txt")

  return value?.n === 42 && text === "hello portable"
}

app.run()
