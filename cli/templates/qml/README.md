# {{title}}

A [Pulsar](https://github.com/riclud/pulsar) app with a QML UI and a Bun
backend. QML is the advanced/escape-hatch path; the default template uses
TypeScript components instead.

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
