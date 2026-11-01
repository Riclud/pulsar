# {{title}}

A [Pulsar](https://github.com/riclud/pulsar) app written entirely in
TypeScript. There is no QML: `main.ts` builds the UI with the `ui` helpers and
`app.store` keeps it in sync.

## Requirements

- [Bun](https://bun.sh) (the Pulsar CLI runs on Bun)
- The Pulsar toolchain: run `pulsar install` once

## Develop

```
bun run dev
```

## Run

```
bun run start
```

## Build a single-file app

```
bun run build
```

The result goes to `dist/{{name}}`.
