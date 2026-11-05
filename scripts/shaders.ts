import { readdirSync } from "fs"
import { join } from "path"
import { compileShader } from "../cli/shaders.ts"

const dir = join(import.meta.dir, "..", "host", "qml", "shaders")

for (const name of readdirSync(dir).filter((file) => file.endsWith(".frag"))) {
  compileShader(join(dir, name), join(dir, `${name}.qsb`))
  console.log(`compiled ${name}`)
}
