import { existsSync, rmSync } from "fs"
import { join, resolve } from "path"
import { createInterface } from "readline"
import { cliVersion, isCompiled } from "./core.ts"
import { control, controlRetry } from "./device.ts"

const PROTOCOL_VERSION = "2025-06-18"
const LOG_LINES = 400
const START_TIMEOUT_MS = 60000

type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue }

type Args = Record<string, unknown>

type Content =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly data: string; readonly mimeType: string }

type ToolResult = {
  readonly content: readonly Content[]
  readonly isError?: boolean
}

type Tool = {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly run: (args: Args) => Promise<ToolResult>
}

type Session = {
  readonly appDir: string
  readonly child: ReturnType<typeof Bun.spawn>
  readonly logs: string[]
}

let session: Session | null = null

const text = (value: string): ToolResult => {
  return { content: [{ type: "text", text: value }] }
}

const json = (value: unknown): ToolResult => {
  return text(typeof value === "string" ? value : JSON.stringify(value, null, 2))
}

const str = (args: Args, key: string): string | undefined => {
  const value = args[key]

  return typeof value === "string" && value.length > 0 ? value : undefined
}

const num = (args: Args, key: string): number | undefined => {
  const value = args[key]

  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const appDirOf = (args: Args): string => {
  const dir = str(args, "appDir") ?? session?.appDir

  if (!dir) throw new Error("no app is running; call pulsar_start with appDir first")

  return resolve(dir)
}

/** A node is named by visible text (labels of icon buttons count), a path, an id or window x/y. */
const selector = (args: Args): Record<string, unknown> => {
  const x = num(args, "x")
  const y = num(args, "y")

  if (x !== undefined && y !== undefined) return { x, y }

  const id = num(args, "id")

  if (id !== undefined) return { id }

  const path = str(args, "path")

  if (path) return { path }

  const name = str(args, "text")

  if (name) return { text: name }

  throw new Error("name the node with text, path, id or x and y")
}

const selectorSchema = {
  text: { type: "string", description: "Visible text or icon label of the node (case-insensitive substring)" },
  path: { type: "string", description: "Exact node path from pulsar_ui" },
  id: { type: "number", description: "Node id from pulsar_ui" },
  x: { type: "number", description: "Window x in logical pixels, with y" },
  y: { type: "number", description: "Window y in logical pixels, with x" },
  appDir: { type: "string", description: "App folder; defaults to the app pulsar_start launched" },
}

// The CLI runs `pulsar dev` as a child: the compiled binary runs itself, the source runs index.ts.
const devCommand = (): string[] => {
  return isCompiled() ? [process.execPath, "dev"] : [process.execPath, join(import.meta.dir, "index.ts"), "dev"]
}

const remember = (logs: string[], chunk: string): void => {
  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue

    logs.push(line)

    if (logs.length > LOG_LINES) logs.shift()
  }
}

const pump = async (stream: ReadableStream<Uint8Array>, logs: string[]): Promise<void> => {
  const reader = stream.getReader()
  const dec = new TextDecoder()

  for (;;) {
    const { value, done } = await reader.read()

    if (done) return

    remember(logs, dec.decode(value))
  }
}

const answers = async (appDir: string): Promise<boolean> => {
  if (!existsSync(join(appDir, ".pulsar", "dev.json"))) return false

  return control(appDir, { cmd: "ping" }).then(
    () => true,
    () => false,
  )
}

const waitForSession = async (appDir: string, child: Session["child"]): Promise<void> => {
  const deadline = Date.now() + START_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("pulsar dev exited; see pulsar_logs")

    if (await answers(appDir)) return

    await new Promise((done) => setTimeout(done, 250))
  }

  throw new Error("the app did not start in time; see pulsar_logs")
}

const stopSession = (): void => {
  if (!session) return

  session.child.kill()
  rmSync(join(session.appDir, ".pulsar", "dev.json"), { force: true })
  session = null
}

const start = async (args: Args): Promise<ToolResult> => {
  const appDir = resolve(str(args, "appDir") ?? process.cwd())

  if (!existsSync(join(appDir, "pulsar.json"))) throw new Error(`no pulsar.json in ${appDir}`)

  stopSession()

  // Offscreen by default: the agent sees screenshots and the user's desktop stays untouched.
  const visible = args.visible === true
  const headless = visible ? {} : { QT_QPA_PLATFORM: "offscreen", QT_QUICK_BACKEND: "software" }
  const logs: string[] = []
  const child = Bun.spawn(devCommand(), {
    cwd: appDir,
    env: { ...process.env, ...headless, NO_COLOR: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  session = { appDir, child, logs }

  void pump(child.stdout, logs)
  void pump(child.stderr, logs)

  await waitForSession(appDir, child)

  return text(`started ${appDir} (${visible ? "window on the desktop" : "offscreen"})`)
}

/** An indented outline of the tree: far fewer tokens than JSON, with what an agent needs to act. */
const outline = (nodes: unknown, depth = 0, out: string[] = []): string[] => {
  if (!Array.isArray(nodes)) return out

  for (const value of nodes) {
    if (!value || typeof value !== "object") continue

    const node = value as Record<string, unknown>
    const props = (node.props ?? {}) as Record<string, unknown>

    if (props.visible === false) continue

    const label = ["text", "title", "placeholder", "label", "value", "a11yLabel"]
      .map((key) => props[key])
      .find((item) => typeof item === "string" && item.length > 0)
    const events = Array.isArray(node.events) && node.events.length > 0 ? ` [${node.events.join(",")}]` : ""
    const name = typeof label === "string" ? ` "${label.length > 80 ? `${label.slice(0, 77)}...` : label}"` : ""

    out.push(`${"  ".repeat(depth)}${String(node.type)} #${String(node.id)}${name}${events}  ${String(node.path)}`)
    outline(node.children, depth + 1, out)
  }

  return out
}

const shot = async (appDir: string, settleMs: number): Promise<ToolResult> => {
  // Screen changes animate for about 200 ms; a short wait shows where they land.
  await new Promise((done) => setTimeout(done, settleMs))

  const image = (await control(appDir, { cmd: "grab" })) as { data?: string; width?: number; height?: number }

  if (!image?.data) throw new Error("screenshot failed")

  return {
    content: [
      { type: "image", data: image.data, mimeType: "image/png" },
      { type: "text", text: `${image.width}x${image.height}` },
    ],
  }
}

const act = async (appDir: string, body: Record<string, unknown>): Promise<ToolResult> => {
  return json(await controlRetry(() => control(appDir, body)))
}

const TOOLS: readonly Tool[] = [
  {
    name: "pulsar_start",
    description:
      "Start a Pulsar app with live reload (pulsar dev). Offscreen by default; set visible to open a real window. Edits to the app's sources reload it.",
    inputSchema: {
      type: "object",
      properties: {
        appDir: { type: "string", description: "Folder with pulsar.json; defaults to the server's working directory" },
        visible: { type: "boolean", description: "Open a window on the desktop instead of offscreen" },
      },
    },
    run: start,
  },
  {
    name: "pulsar_stop",
    description: "Stop the app pulsar_start launched.",
    inputSchema: { type: "object", properties: {} },
    run: () => {
      stopSession()

      return Promise.resolve(text("stopped"))
    },
  },
  {
    name: "pulsar_ui",
    description:
      "The rendered UI tree: one line per node with type, #id, text, [events] and path. Use the text, id or path to act on a node.",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "boolean", description: "Return the raw tree with all props instead of the outline" },
        appDir: selectorSchema.appDir,
      },
    },
    run: async (args) => {
      const tree = await control(appDirOf(args), { cmd: "tree" })

      return args.json === true ? json(tree) : text(outline(tree).join("\n") || "(empty tree)")
    },
  },
  {
    name: "pulsar_screenshot",
    description: "A PNG of the app window, taken after transitions settle.",
    inputSchema: {
      type: "object",
      properties: {
        settleMs: { type: "number", description: "Wait before the shot, default 300" },
        appDir: selectorSchema.appDir,
      },
    },
    run: (args) => shot(appDirOf(args), num(args, "settleMs") ?? 300),
  },
  {
    name: "pulsar_click",
    description: "Click a node with a real mouse press and release at its center.",
    inputSchema: { type: "object", properties: selectorSchema },
    run: (args) => act(appDirOf(args), { cmd: "pointer", action: "click", ...selector(args) }),
  },
  {
    name: "pulsar_hover",
    description: "Move the pointer over a node, or off the window with leave.",
    inputSchema: {
      type: "object",
      properties: { ...selectorSchema, leave: { type: "boolean", description: "Take the pointer off the window" } },
    },
    run: (args) => {
      const target = args.leave === true ? { x: 0, y: 0 } : selector(args)

      return act(appDirOf(args), { cmd: "pointer", action: args.leave === true ? "leave" : "hover", ...target })
    },
  },
  {
    name: "pulsar_scroll",
    description: "Turn the mouse wheel over a node. Positive dy scrolls the content down.",
    inputSchema: {
      type: "object",
      properties: { ...selectorSchema, dy: { type: "number", description: "Pixels, 120 per wheel notch" } },
    },
    run: (args) => act(appDirOf(args), { cmd: "wheel", dy: num(args, "dy") ?? 120, ...selector(args) }),
  },
  {
    name: "pulsar_type",
    description:
      "Type text. With into (a field's placeholder or label) the field's value is set directly; without it the text is typed key by key into the focused field.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        into: { type: "string", description: "Placeholder or label of the target field" },
        appDir: selectorSchema.appDir,
      },
      required: ["text"],
    },
    run: (args) => {
      const value = str(args, "text") ?? ""
      const into = str(args, "into")

      return into
        ? act(appDirOf(args), { cmd: "type", value, into })
        : act(appDirOf(args), { cmd: "keys", text: value })
    },
  },
  {
    name: "pulsar_key",
    description: "Press a key, optionally with modifiers: enter, escape, tab, backspace, up, ctrl+s, shift+tab, a.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" }, appDir: selectorSchema.appDir },
      required: ["key"],
    },
    run: (args) => {
      const parts = (str(args, "key") ?? "").split("+")
      const key = parts.pop() ?? ""

      return act(appDirOf(args), { cmd: "key", key, modifiers: parts })
    },
  },
  {
    name: "pulsar_back",
    description: "Send the back event, as the Android back button or gesture does.",
    inputSchema: { type: "object", properties: { appDir: selectorSchema.appDir } },
    run: (args) => act(appDirOf(args), { cmd: "back" }),
  },
  {
    name: "pulsar_wait_for",
    description: "Wait until a text appears in the UI tree.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        timeoutMs: { type: "number", description: "Default 5000" },
        appDir: selectorSchema.appDir,
      },
      required: ["text"],
    },
    run: async (args) => {
      const appDir = appDirOf(args)
      const wanted = (str(args, "text") ?? "").toLowerCase()
      const deadline = Date.now() + (num(args, "timeoutMs") ?? 5000)

      while (Date.now() < deadline) {
        const lines = outline(await control(appDir, { cmd: "tree" }))

        if (lines.some((line) => line.toLowerCase().includes(wanted))) return text("found")

        await new Promise((done) => setTimeout(done, 150))
      }

      return { content: [{ type: "text", text: `not found: ${wanted}` }], isError: true }
    },
  },
  {
    name: "pulsar_state",
    description: "The app's shared store (app.store values).",
    inputSchema: { type: "object", properties: { appDir: selectorSchema.appDir } },
    run: async (args) => json(await control(appDirOf(args), { cmd: "state" })),
  },
  {
    name: "pulsar_eval",
    description: "Evaluate a JS expression in the app runtime (QuickJS apps) and return its value.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" }, appDir: selectorSchema.appDir },
      required: ["code"],
    },
    run: async (args) => json(await control(appDirOf(args), { cmd: "eval", code: str(args, "code") ?? "" })),
  },
  {
    name: "pulsar_logs",
    description: "Recent output of the running app: logs, errors and reloads.",
    inputSchema: {
      type: "object",
      properties: { lines: { type: "number", description: "How many of the last lines, default 80" } },
    },
    run: (args) => {
      const lines = session?.logs.slice(-(num(args, "lines") ?? 80)) ?? []

      return Promise.resolve(text(lines.join("\n") || "(no output)"))
    },
  },
  {
    name: "pulsar_reload",
    description: "Restart the app's runtime; the window stays open.",
    inputSchema: { type: "object", properties: { appDir: selectorSchema.appDir } },
    run: (args) => act(appDirOf(args), { cmd: "reload" }),
  },
]

type Request = {
  readonly id?: string | number | null
  readonly method?: string
  readonly params?: Record<string, unknown>
}

const reply = (id: Request["id"], result: unknown): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`)
}

const fail = (id: Request["id"], code: number, message: string): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`)
}

const callTool = async (params: Record<string, unknown>): Promise<ToolResult> => {
  const tool = TOOLS.find((item) => item.name === params.name)

  if (!tool) return { content: [{ type: "text", text: `unknown tool: ${String(params.name)}` }], isError: true }

  try {
    return await tool.run((params.arguments ?? {}) as Args)
  } catch (error) {
    // Tool failures go back to the agent as results, so it can read them and retry.
    return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true }
  }
}

/** Answers one JSON-RPC message; exported for tests. */
export const handleMessage = async (message: Request): Promise<unknown> => {
  if (message.method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "pulsar", version: cliVersion() },
      instructions:
        "Drive Pulsar apps: pulsar_start an app folder, read pulsar_ui or pulsar_screenshot, act with pulsar_click, pulsar_type, pulsar_key, pulsar_hover and pulsar_scroll, and check pulsar_logs. Source edits hot-reload the app.",
    }
  }

  if (message.method === "tools/list") {
    return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }
  }

  if (message.method === "tools/call") return callTool(message.params ?? {})

  if (message.method === "ping") return {}

  return undefined
}

/** `pulsar mcp`: a Model Context Protocol server on stdio. */
export const runMcp = (): void => {
  const lines = createInterface({ input: process.stdin })

  lines.on("line", (line) => {
    let message: Request

    try {
      message = JSON.parse(line) as Request
    } catch {
      fail(null, -32700, "parse error")

      return
    }

    // Notifications carry no id and need no answer.
    if (message.id === undefined || message.id === null) return

    void handleMessage(message).then((result) => {
      if (result === undefined) {
        fail(message.id, -32601, `method not found: ${String(message.method)}`)

        return
      }

      reply(message.id, result as JSONValue)
    })
  })

  lines.on("close", () => {
    stopSession()
    process.exit(0)
  })

  const stop = () => {
    stopSession()
    process.exit(0)
  }

  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
}
