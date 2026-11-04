import { App } from "../../../core/sdk/index.ts"

new App()

const fail = async () => {
  throw new Error("UNHANDLED_ASYNC")
}

void fail()
