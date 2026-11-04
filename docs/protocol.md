# Pulsar protocol

The host (C++/Qt) and the runtime (Bun, Node, or an embedded engine) talk over
a small framed channel. On desktop the runtime is a separate process:

```
qml-host ── stdio ──► bridge ── stdio ──► runtime
```

Every message is a frame:

```
frame = type:u8 | length:u32 (little-endian) | payload[length]
```

- `type = 0x01` — **control**: a JSON-RPC 2.0 object (the payload is JSON text);
- `type = 0x02` — **data**: a binary payload (see below).

Frames are the same in both directions. The bridge forwards bytes and reports
crashes; it does not parse the framing except for the `__crash` it injects.

## Transport abstraction

The runtime talks through a `Transport` (`core/runtime/protocol.ts`):

- `send(message)` — send a control frame;
- `onMessage(handler)` / `onClose(handler)` — receive host messages / detect EOF;
- `sendBinary(streamId, data)` / `onData(handler)` — the binary data channel.

The built-in `createStdioTransport()` reads and writes frames on stdin/stdout.
An in-process transport (an embedded engine on mobile) implements the same
interface without a child process, and a different runtime only needs an entry
point plus a transport.

## Handshake

When the channel starts the runtime sends an `__hello` control message:

```json
{
  "jsonrpc": "2.0",
  "method": "__hello",
  "params": {
    "protocol": 1,
    "runtime": "bun",
    "version": "1.x.y",
    "binary": true,
    "capabilities": ["fs.readFile", "nw.fetch", "paths.get"]
  }
}
```

The host logs it and rejects a mismatched `protocol`
(`PROTOCOL_VERSION` in `core/runtime/protocol.ts` must equal
`kBridgeProtocolVersion` in `host/main.cpp`). `capabilities` doubles as
capability negotiation; `binary` advertises the data channel.

## Host → runtime (control)

- `__sync` — request the full store snapshot (answered once the app is wired);
- `__launch` — the command line the OS handed the app:
  `{ "argv": [...], "cwd", "first" }`. The runtime splits it into
  `open-url` (`{ "url" }`) and `open-file` (`{ "path" }`) events (dispatched to
  `App.on`), and raises `second-instance` (`{ "argv", "cwd" }`) when the launch
  was forwarded by another instance rather than being the first (`first=false`);
- `__log`, `__event`, `__dialog-result` — notifications (no `id`);
- `__event` carries window/tray lifecycle events as
  `{ "name": "window-resize", "data": { "label": "main", … } }`; the runtime
  dispatches `data` to the handler registered for `name` (`App.on`). Names:
  `window-show`, `window-hide`, `window-resize` (`width`,`height`), `window-move`
  (`x`,`y`), `window-state` (`state`), `window-focus`, `window-blur`,
  `window-close`, `window-all-closed`, `tray-menu`, `tray-activated`,
  `theme-changed`, `notification-click`, `ui-event`;
- anything else is treated as an app event (`App.on`) or a capability call
  (`fs.readFile|writeFile|appendFile|listDir|exists|stat|mkdir|remove|rename|copy|moveToTrash`,
  `nw.fetch|request|abort`, `paths.get`, `storage.get|has|set|remove`, `shell.open`, `shell.notify`,
  `secure.available|get|set|remove`, `dialog.openFile|openFiles|openDirectory|saveFile|message`,
  `screen.list`, `theme.get`, `system.locale`, `tray`, `window`).

A manifest that lists `permissions` turns capability calls into a checked
operation: a call whose permission is not granted fails with a
`permission denied` error response (an absent `permissions` field allows all).

## Runtime → host (control)

- responses: `{ "jsonrpc": "2.0", "id", "result" | "error", "state"?, "unset"? }`
  where `state`/`unset` are store patches to apply;
- notifications: `__config`, `__window`, `__emit`, `__ui`, `__query`, `__notify`,
  `__dialog`, `__tray`, `__recent`, `__net`, `__log`, `__event`, `__quit`, `__reload`,
  `__error`, `__hello`;
- `__crash` is emitted by the bridge when the runtime dies (treated as a
  failure).

## Host queries & notifications

Some capabilities need host data or native UI, so the runtime asks the host with
a token and resolves the caller's promise on the reply:

- `__query` `{ token, kind }` → `__query-result` `{ token, value }`. Kinds:
  `screen.list` (monitors with geometry, work area, scale), `theme.get`
  (`{ scheme: "light" | "dark" }`) and the secret store: `secure.available`
  (bool), `secure.get` (`{ key }` → string or null), `secure.set`
  (`{ key, value }` → bool) and `secure.remove` (`{ key }` → bool);
- `__notify` `{ token, title, body }` — native notification. A click comes back
  as the `notification-click` event with the same token;
- `__dialog` `{ token, kind, … }` → `__dialog-result` `{ token, value }`, where
  `kind` is `open`, `open-files`, `open-directory`, `save` or `message`;
- `__recent` `{ action: "add", path }` or `{ action: "clear" }` — updates the OS
  recent-documents list.

The host also pushes `theme-changed` (`{ scheme }`) when the system switches
appearance.

## Network

HTTP is implemented by the host, so the runtime never depends on an engine's
`fetch`:

- `__net` `{ id, action: "request", url, method, headers, body?, bodyEncoding?,
timeoutMs?, redirect?, maxRedirects?, responseType?, tlsFingerprint? }` starts
  a request; `{ id, action: "abort" }` cancels it;
- the host replies with `__net-event` `{ id, type: "response", status,
statusText, url, headers }`, then either `{ id, type: "data", text }` for
  text responses or data frames with `streamId = id` for binary responses, and
  finally `{ id, type: "end" }` or `{ id, type: "error", code, message }`;
- error codes: `ERR_NETWORK`, `ERR_TIMEOUT`, `ERR_ABORTED`, `ERR_TLS`,
  `ERR_TOO_LARGE`, `ERR_REDIRECT`, `ERR_FINGERPRINT_UNAVAILABLE`;
- `tlsFingerprint` selects the impersonating backend. Builds without it fail
  with `ERR_FINGERPRINT_UNAVAILABLE` instead of silently using the native TLS
  stack.

WebSockets share the same channel:

- `__net` `{ id, action: "websocket", url, headers?, protocols?, timeoutMs? }`
  opens a `ws://` or `wss://` connection;
- `{ id, action: "websocket-send", text }` sends a text message, or
  `{ id, action: "websocket-send", base64, encoding: "base64" }` sends binary;
- `{ id, action: "websocket-close", code?, reason? }` starts the close
  handshake; `{ id, action: "abort" }` drops the socket;
- the host replies with `__net-event` `{ id, type: "open", protocol }`, then
  `{ id, type: "message", text }` for text or a data frame with `streamId = id`
  for binary, then `{ id, type: "close", code, reason, wasClean }`; failures
  arrive as `{ id, type: "error", code, message }` (same error codes as HTTP).

## Windows

Windows come either from the start windows in `pulsar.json` or from code
(`App.createWindow`). Both reach the host as:

- `__config` `{ "windows": [ … ] }` — the initial windows;
- `__window` `{ "action": "create", "label", "ui", "width", … }` — create a
  window on demand. Other actions: `show`, `hide`, `close`, `destroy`, `focus`,
  `minimize`, `maximize`, `restore`, `setTitle`, `setSize`, `setPosition`,
  `fullscreen`, `alwaysOnTop`.

The host answers with the lifecycle events above. Every window gets its own QML
context property `PulsarWindowLabel`, so UI code knows which window it runs in.

## Backend → UI events

`App.send(event, payload, target)` pushes a one-off event to the UI as
`__emit` `{ "event", "payload", "target" }`, where `target` is a window label or
`*` (all windows). The host re-emits it as the Qt signal
`Bridge::appEvent(event, payload, target)`; QML subscribes through the `Pulsar`
singleton and filters by `PulsarWindowLabel`:

```qml
Connections {
    target: Pulsar
    function onAppEvent(event, payload, target) {
        if (target === "*" || target === PulsarWindowLabel) { /* … */ }
    }
}
```

## State sync

The app's `Store` is the shared state. `__sync` returns a full snapshot; every
change afterwards is pushed as a `state`/`unset` patch, either attached to a
response or as an unsolicited `__state` notification.

## JS-rendered windows

A window declared **without a `ui` file** is rendered from a JS-built tree. The
app builds the tree with the `ui` helpers and renders it:

```ts
app
  .window("main")
  .render(() =>
    ui.column({ gap: 8 }, [ui.text("Hello"), ui.button("+1", { onClick: () => app.store.set("n", n + 1) })]),
  )
```

Every change to `Store` rebuilds the tree in the runtime, but only changed
subtrees cross the bridge. The first render sends the full tree; later renders
send a patch and the host applies it to the existing items. The full tree is
sent again when the root children or a node type change.

```
__ui       { target, tree }                               runtime -> host (full render)
__ui-patch { target, patches: [{ path, node, shallow? }] } runtime -> host (changed nodes)
__event    { name: "ui-event", data: { target, path, id, event, value } }
                                                          host -> runtime
```

A patch with `shallow: true` replaces only the node's own props and events: it
has no `children`, and the host keeps the ones it already has. Any other patch
carries the full serialized subtree at `path`. Child paths come from the key or
from the child's position among its siblings, counting absent conditional
children, so a sibling that appears does not move the others. Callbacks stay in the runtime and are
dispatched by window label and node path, with the numeric `id` kept as a
fallback for older payloads.

## Data channel

Binary payloads travel as data frames and never touch JSON:

```
data payload = streamId:u32 (little-endian) | bytes
```

- runtime → host: `Transport.sendBinary(streamId, data)`; the host re-emits it
  as the Qt signal `Bridge::data(quint32 streamId, const QByteArray &data)`;
- host → runtime: `Bridge::sendBinary(streamId, data)`; a runtime consumes it
  via `Transport.onData((streamId, data) => …)`.

A `streamId` lets several logical streams share the one channel. Bounded by
`MAX_FRAME` (64 MiB) on both sides.

Still to come (interface is already in place): chunked **streaming** with flow
control, and mapping the data channel to higher-level APIs (e.g. binary file
I/O). Until then, keep the `Store` JSON-safe and pass paths/URLs rather than
blobs through control.

## Runtime abstraction

The bridge is runtime-agnostic:

- `PULSAR_RUNTIME` — a standalone runtime binary; the bridge runs it directly;
- otherwise `BUN_BIN` (default `bun`) + `core/runtime/main.ts`.

A new runtime needs an entry that wires `Transport` + `App` (like
`core/runtime/main.ts`) and a way to start it.
