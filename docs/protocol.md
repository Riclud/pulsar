# Pulsar protocol

The host (C++/Qt) and the runtime (Bun, Node, or an embedded engine) talk over
a small JSON-RPC control channel. On desktop the runtime is a separate process:

```
qml-host ── stdio ──► bridge ── stdio ──► runtime
```

Messages are JSON-RPC 2.0, one JSON object per line, on the runtime's stdin and
stdout. The bridge forwards bytes and reports crashes; it does not parse the
protocol.

## Transport abstraction

The runtime talks through a `Transport` (`core/runtime/protocol.ts`):

- `send(message)` — send a control message (JSON);
- `onMessage(handler)` / `onClose(handler)` — receive host messages / detect EOF;
- `sendBinary(data)` — reserved for the data channel (see below).

The built-in `createStdioTransport()` uses stdin/stdout. An in-process transport
(an embedded engine on mobile) implements the same interface without a child
process, and a different runtime only needs an entry point plus a transport.

## Handshake

When the channel starts the runtime sends an `__hello` notification:

```json
{
  "jsonrpc": "2.0",
  "method": "__hello",
  "params": {
    "protocol": 1,
    "runtime": "bun",
    "version": "1.x.y",
    "capabilities": ["fs.readFile", "nw.fetch", "paths.get"]
  }
}
```

The host logs it and rejects a mismatched `protocol`
(`PROTOCOL_VERSION` in `core/runtime/protocol.ts` must equal
`kBridgeProtocolVersion` in `host/main.cpp`). `capabilities` also serves as
capability negotiation: it lists what the runtime registered.

## Host → runtime

- `__sync` — request the full store snapshot (answered once the app is wired);
- `__log`, `__event`, `__dialog-result` — notifications (no `id`);
- anything else is treated as an app event (`App.on`) or a capability call
  (`fs.readFile`, `fs.writeFile`, `fs.listDir`, `fs.exists`, `nw.fetch`,
  `paths.get`, `storage.get|has|set|remove`, `shell.open`, `shell.notify`,
  `dialog.openFile|saveFile|message`, `tray`, `window`).

## Runtime → host

- responses: `{ "jsonrpc": "2.0", "id", "result" | "error", "state"?, "unset"? }`
  where `state`/`unset` are store patches to apply;
- notifications: `__config`, `__window`, `__dialog`, `__tray`, `__log`,
  `__event`, `__quit`, `__reload`, `__error`, `__hello`;
- `__crash` is emitted by the bridge when the runtime dies (treated as a
  failure).

## State sync

The app's `Store` is the shared state. `__sync` returns a full snapshot; every
change afterwards is pushed as a `state`/`unset` patch, either attached to a
response or as an unsolicited `__state` notification.

## Runtime abstraction

The bridge is runtime-agnostic:

- `PULSAR_RUNTIME` — a standalone runtime binary; the bridge runs it directly;
- otherwise `BUN_BIN` (default `bun`) + `core/runtime/main.ts`.

A new runtime needs an entry that wires `Transport` + `App` (like
`core/runtime/main.ts`) and a way to start it.

## Data channel (reserved)

The control channel is JSON, which is fine for control but not for bulk or
binary data (base64 inflates, and there is no streaming/backpressure). The
intended split:

- **control** — JSON-RPC (this document), always available;
- **data** — a future binary/streaming channel: either a dedicated fd/pipe or
  length-prefixed binary frames, carrying large payloads (images, audio, file
  contents) while JSON carries only a descriptor.

The seam already exists: `Transport.sendBinary` / `Transport.supportsBinary`.
The stdio transport currently reports `supportsBinary = false` and throws, so
until the data channel lands, pass file paths or URLs (not bytes) and keep the
`Store` JSON-safe.
