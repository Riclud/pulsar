#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const [cmd, ...args] = process.argv.slice(2)

const MAIN_TS = `import { App } from "pulsar";

const app = new App({ ui: "ui/main.qml", width: 800, height: 600, title: "My App" });

app.store.set("greeting", "Hello from Pulsar");

app.handle("hello", async (params: { name: string }) => \`Hello, \${params.name}!\`);

app.run();
`

const MAIN_QML = `import QtQuick
import QtQuick.Controls

ApplicationWindow {
    visible: true
    width: 800
    height: 600
    title: "My App"

    Column {
        anchors.centerIn: parent
        spacing: 12
        Label { text: Store.greeting }
        Button {
            text: "Call backend"
            onClicked: Pulsar.call("hello", { name: "World" }, function (res, err) {
                console.log(res, err);
            })
        }
    }
}
`

function findHost(): string {
  const fromEnv = process.env.PULSAR_HOST
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const candidates = [resolve(import.meta.dir, "..", "zig-out", "bin", "qml-host"), "/usr/local/bin/pulsar-host"]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error("pulsar host binary not found (set PULSAR_HOST)")
}

function run() {
  const appDir = process.cwd()
  const host = findHost()
  const r = spawnSync(host, [], {
    stdio: "inherit",
    env: { ...process.env, PULSAR_APP: appDir },
  })
  process.exit(r.status ?? 0)
}

function init() {
  const dir = resolve(args[0] ?? ".")
  mkdirSync(join(dir, "ui"), { recursive: true })
  writeFileSync(join(dir, "main.ts"), MAIN_TS)
  writeFileSync(join(dir, "ui", "main.qml"), MAIN_QML)
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "my-app",
        private: true,
        type: "module",
        dependencies: { pulsar: "latest" },
      },
      null,
      2,
    ) + "\n",
  )
  console.log(`pulsar: initialized ${dir}`)
}

function usage() {
  console.log(
    "pulsar <command>\n\n  init [dir]   scaffold a new app\n  run          run the app in the current directory\n  build        build a distributable bundle",
  )
}

switch (cmd) {
  case "run":
    run()
    break
  case "init":
    init()
    break
  case "build":
    console.error("pulsar build: not implemented yet")
    process.exit(1)
    break
  default:
    usage()
    process.exit(cmd ? 1 : 0)
}
