# q

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## QML ⇄ Zig bridge ⇄ Bun

Прототип: QML-UI (Qt 6) → C++-мост (`Bridge`) → Zig-bridge (stdio JSON-RPC) → Bun (fs-бэкенд).

- `src/main.cpp` — QML-хост, регистрирует QML-объект `bridge`.
- `src/bridge.{h,cpp}` — C++-мост (QProcess → `zig-out/bin/bridge`, сигнал `response(id, result, error)`).
- `src/bridge.zig` — Zig-bridge: реле JSON-RPC строка-в-строку, локально отвечает на `zig.ping`.
- `backend/server.ts` — Bun-бэкенд: `fs.readFile` / `fs.writeFile` / `fs.listDir` / `fs.exists`.
- `qml/main.qml` — демо-кнопки.

```bash
zig build          # собирает bridge (Zig) и qml-host (g++ + Qt6)
zig build run      # запускает QML-приложение (поднимает Zig-bridge + Bun)
```

Headless-проверка цепочки:

```bash
QT_QPA_PLATFORM=offscreen AUTO_QUIT_MS=4000 SELFTEST=1000 \
  QT_LOG_FILE=/tmp/qt.log ./zig-out/bin/qml-host
```

Прямой тест Zig-bridge → Bun (без Qt):

```bash
printf '%s\n' '{"id":1,"method":"fs.readFile","params":{"path":"package.json"}}' \
  '{"id":2,"method":"zig.ping","params":{}}' | ./zig-out/bin/bridge "$PWD"
```

Из QML Bun-логика зовётся так:

```qml
// main.qml
var id = bridge.invoke("fs.readFile", { path: "package.json" }); // id: qint64
bridge.response.connect(function (id, result, error) { /* result / error */ });
```
