import { App } from "../../../core/sdk/index.ts"

new App()

const churn = () => {
  const junk: Array<{ index: number; label: string }> = []

  for (let index = 0; index < 20000; index++) junk.push({ index, label: `x${index}` })

  return junk.length
}

const timer = setInterval(() => {
  clearInterval(timer)

  console.log(`TIMER_DONE ${churn()}`)
}, 1)
