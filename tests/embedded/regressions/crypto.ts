import { App, crypto } from "../../../core/sdk/index.ts"

new App()

void (async () => {
  const random = await crypto.randomBytes(16)
  const other = await crypto.randomBytes(16)
  const key = await crypto.pbkdf2({ password: "password", salt: "c2FsdA==", iterations: 4096 })
  const rejected = await crypto.pbkdf2({ password: "password", salt: "", iterations: 4096 })

  console.log(`CRYPTO_RANDOM ${random.length} ${random !== other}`)
  console.log(`CRYPTO_PBKDF2 ${key}`)
  console.log(`CRYPTO_REJECTED ${rejected}`)
})()
