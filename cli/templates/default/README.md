# {{title}}

A [Pulsar](https://github.com/riclud/pulsar) app written entirely in
TypeScript. There is no QML: `main.ts` builds the UI with functional components
(`Card`, `Row`, `Header`, ...), `bind` keeps it in sync with `app.store`, and
`For` / `When` handle lists and conditionals.

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
