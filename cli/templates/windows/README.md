# {{title}}

A multi-window [Pulsar](https://github.com/riclud/pulsar) app: two windows share
one `Store`, the app controls them via `app.window(label)`, and the system tray
menu sends events back to the app.

## Requirements

- [Bun](https://bun.sh)
- The Pulsar toolchain: run `pulsar install` once

## Develop

```
bun run dev
```

The result of `bun run build` goes to `dist/{{name}}`.
