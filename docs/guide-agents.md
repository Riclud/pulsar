# AI agents

An AI agent can build a Pulsar app and check its own work: it runs the app, reads the
screen, clicks through it and reads the logs while it edits the code. Two pieces make this
work:

- **`pulsar mcp`**, a [Model Context Protocol](https://modelcontextprotocol.io) server that
  gives the agent tools to start, see and drive the app;
- **`pulsar skill`**, a skill that teaches the agent Pulsar itself, so it does not search the
  docs or GitHub.

The app starts offscreen by default. Clicks and keys go to the app's window, never to your
mouse or keyboard, so you can keep working while the agent tests.

## Connect the MCP server

Every client runs the same command, `pulsar mcp`, over stdio.

**Claude Code**

```sh
claude mcp add pulsar -- pulsar mcp
```

**opencode:** run `opencode mcp add pulsar -- pulsar mcp`, or add it to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "pulsar": { "type": "local", "command": ["pulsar", "mcp"] },
    },
  },
}
```

**Cursor** (`.cursor/mcp.json`) and other clients that use the `mcpServers` format:

```json
{
  "mcpServers": {
    "pulsar": { "command": "pulsar", "args": ["mcp"] }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.pulsar]
command = "pulsar"
args = ["mcp"]
```

## Install the skill

```sh
pulsar skill            # into .claude/skills/pulsar of this project
pulsar skill --global   # for every project
pulsar skill --dir path # anywhere else
```

The skill holds a short guide with the commands, the manifest and its permissions, what
QuickJS lacks, the UI and state model and common mistakes. Next to it are tested recipes,
the full API reference and the components and layout guides. All of them come from your
installed CLI, so they match its version.

Claude Code and opencode read `.claude/skills`.

## Tools

| Tool | What it does |
| --- | --- |
| `pulsar_start` | Runs the app with live reload. `appDir` picks the folder, `visible: true` opens a real window. |
| `pulsar_stop` | Stops it. |
| `pulsar_ui` | The UI tree as an outline: type, `#id`, text, `[events]` and path per node. `json: true` returns every prop. |
| `pulsar_screenshot` | A PNG of the window, taken after transitions settle (`settleMs`, default 300). |
| `pulsar_click` | A real mouse click at a node. |
| `pulsar_hover` | Moves the pointer over a node; `leave: true` takes it off the window. |
| `pulsar_scroll` | Turns the wheel over a node; `dy` in pixels, 120 per notch. |
| `pulsar_type` | Types into the focused field key by key, or sets a field's value with `into`. |
| `pulsar_key` | A key with optional modifiers: `enter`, `escape`, `tab`, `ctrl+s`, `shift+tab`. |
| `pulsar_back` | The Android back event. |
| `pulsar_wait_for` | Waits until a text appears in the tree. |
| `pulsar_state` | The app store. |
| `pulsar_eval` | Evaluates JS in the app (QuickJS apps). |
| `pulsar_logs` | Recent output: logs, errors and reloads. |
| `pulsar_reload` | Restarts the runtime; the window stays. |

The tools name a node by its visible text, an icon button's `a11yLabel`, a `path` or `id`
from `pulsar_ui`, or window `x` and `y`. Give icon buttons an `a11yLabel`: the agent finds
them by it, and screen readers use it too.

## A typical session

1. `pulsar_start` with the app folder.
2. `pulsar_screenshot` to see the first screen, and `pulsar_ui` for the names it can click.
3. `pulsar_click` on "New task", then `pulsar_type` with `into: "Title"` and `pulsar_key`
   with `enter`.
4. `pulsar_wait_for` with the new title, then `pulsar_screenshot` to check the result.
5. After a source edit, the app reloads by itself; `pulsar_logs` shows compile errors.

## From a terminal

The same control works without MCP, next to `pulsar dev`:

```sh
pulsar dev                  # in one terminal
pulsar ui                   # in another, from the app folder
pulsar tap "Save"
pulsar hover "Copy"
pulsar scroll "Tasks" --dy 360
pulsar keys "milk" && pulsar key enter
pulsar expect "milk"
pulsar shot --out shot.png
```

On Android these commands drive a `pulsar dev --android` session on the phone.

## Limits

- The clipboard needs a real window, so offscreen runs cannot check what was copied. Check
  the toast or the logs instead.
- `pulsar_eval` needs the QuickJS engine; apps that bundle Bun or Node answer with an error.
- `pulsar_start` runs desktop apps. For a phone, start `pulsar dev --android` yourself. The
  terminal commands then drive it, and so do the MCP tools with `appDir`.
- Buttons that open a browser or a file manager open them for real on your desktop.
