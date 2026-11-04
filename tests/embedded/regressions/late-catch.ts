import { App } from "../../../core/sdk/index.ts"

new App()

const rejected = Promise.reject(new Error("LATE_CATCH"))

queueMicrotask(() => {
  rejected.catch(() => console.log("LATE_CATCH_HANDLED"))
})
