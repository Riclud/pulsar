import { spawn } from "node:child_process"
import type { CapRegistry } from "../sdk/index.ts"

/** Platform command that opens a URL in the default application. */
function opener(url: string): { cmd: string; args: string[] } {
  if (process.platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", url] }
  if (process.platform === "darwin") return { cmd: "open", args: [url] }
  return { cmd: "xdg-open", args: [url] }
}

export const shellCaps: CapRegistry = {
  "shell.open": (p: { url: string }) =>
    new Promise((resolve, reject) => {
      const { cmd, args } = opener(p.url)
      const child = spawn(cmd, args, { stdio: "ignore", detached: true })
      child.on("error", reject)
      child.on("exit", () => resolve(true))
    }),

  // Best-effort desktop notification.
  "shell.notify": (p: { title: string; body?: string }) =>
    new Promise((resolve) => {
      const title = p.title ?? ""
      const body = p.body ?? ""
      let child: ReturnType<typeof spawn> | null = null
      if (process.platform === "darwin") {
        child = spawn("osascript", ["-e", `display notification "${body}" with title "${title}"`], {
          stdio: "ignore",
        })
      } else if (process.platform === "linux") {
        child = spawn("notify-send", [title, body], { stdio: "ignore" })
      }
      if (!child) {
        resolve(false)
        return
      }
      child.on("error", () => resolve(false))
      child.on("exit", () => resolve(true))
    }),
}
