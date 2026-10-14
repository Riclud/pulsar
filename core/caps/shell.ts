import { spawn } from "child_process"
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
}
