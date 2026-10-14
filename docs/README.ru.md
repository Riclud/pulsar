<p align="center">
  <a href="../README.md">English</a> ·
  <strong>Русский</strong>
</p>

# Pulsar

Фреймворк для десктопных приложений — как Electron, но с интерфейсом на
**QML** и бэкендом на **Bun**, поставляемый одним самодостаточным
исполняемым файлом.

- **Интерфейс**: QML (нативный рендеринг на GPU, низкое потребление памяти —
  без Chromium).
- **Бэкенд**: TypeScript на [Bun](https://bun.sh).
- **Мост**: слой capabilities между QML и бэкендом плюс небольшой Qt-хост и
  супервизор процессов на C++.
- **Упаковка**: `pulsar build` собирает один файл со встроенным рантаймом Bun
  (а по умолчанию — и Qt).

## Требования

- **[Bun](https://bun.sh) ≥ 1.2** — на нём работают CLI и каждое приложение.
- **Qt 6.8+** — только если вы собираете хост из исходников или используете
  `--slim`-toolchain (`pulsar build --slim` / `pulsar install --slim`).
  Обычный toolchain и сборки содержат Qt, так что конечному пользователю
  ничего ставить не нужно.

## Установка

### Из релиза (рекомендуется)

> **Релизные ассеты сейчас собираются только под Linux x64.** macOS и Windows
> в процессе — там используйте [сборку из исходников](#из-исходников).
> Bootstrap-скрипты уже определяют эти платформы и заработают, как только их
> ассеты будут опубликованы.

Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/riclud/pulsar/main/install.sh | sh
pulsar install          # скачивает нативный toolchain (host + bridge + Qt)
```

macOS / Windows (когда ассеты будут опубликованы):

```sh
curl -fsSL https://raw.githubusercontent.com/riclud/pulsar/main/install.sh | sh
pulsar install
```

```powershell
iwr https://raw.githubusercontent.com/riclud/pulsar/main/install.ps1 -UseBasicParsing | iex
pulsar install
```

Bootstrap ставит CLI в `~/.local/share/pulsar` (или `%LOCALAPPDATA%\pulsar` в
Windows) и шим `pulsar` в `PATH`. Затем `pulsar install` скачивает toolchain
для платформы:

- по умолчанию: **fat** — со встроенным Qt, без настройки;
- `--slim` — без Qt, использует системный.

### Из исходников

```sh
git clone https://github.com/riclud/pulsar
cd pulsar
bun install
cmake -S . -B build && cmake --build build   # собирает qml-host, bridge и launcher в build/bin/
bun cli/index.ts doctor   # проверка
```

Требуется CMake, компилятор C++20 и установленный Qt 6 dev
(`qmake`/`pkg-config`). См. «Сборка из исходников» ниже.

## Быстрый старт

```sh
pulsar create my-app      # скаффолд (шаблоны: default, windows, tray)
cd my-app
pulsar dev                # запуск с горячей перезагрузкой
```

Структура `my-app`:

```
my-app/
  pulsar.json     # манифест приложения: id, окна, точка входа
  main.ts         # бэкенд (Bun) — App, состояние, события
  ui/main.qml     # интерфейс (QML)
  assets/icon.png
  package.json
  tsconfig.json
```

`main.ts`:

```ts
import { App } from "pulsar"

const app = new App()

app.store.set("greeting", "Hello from Pulsar")

app.on("greet", (params: { name: string }) => {
  app.store.set("greeting", `Hello, ${params.name}!`)
})

app.run()
```

`ui/main.qml`:

```qml
import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true

    Column {
        anchors.centerIn: parent
        spacing: 12

        Label { text: Store.greeting || "" }

        Button {
            text: "Greet"
            onClicked: Pulsar.emit("greet", { name: "World" })
        }
    }
}
```

`pulsar.json` задаёт параметры окна по умолчанию, поэтому `new App()` можно
вызывать без аргументов.

## CLI

```
pulsar <command>

  create <name>  создать новое приложение (--template default|windows|tray)
  install        скачать нативный toolchain для этой платформы
  update         обновить CLI до последнего релиза
  dev            запуск с горячей перезагрузкой (следит за исходниками)
  run            запустить приложение в текущем каталоге
  build          собрать один исполняемый файл
  doctor         проверить toolchain (host, bridge, Qt, Bun)
  version        показать версию
  help           показать справку
```

Полезные флаги и алиасы:

| Команда         | Флаги                                                         |
| --------------- | ------------------------------------------------------------- |
| `create <name>` | `--template <t>`, `--dir <path>`, `--force`                   |
| `install`       | `--version <v>\|latest`, `--slim`                             |
| `build`         | `--out <dir>` / `-o <dir>`, `--slim`                          |
| `run`, `dev`    | env `PULSAR_APP` (каталог приложения), `PULSAR_WATCH` (`dev`) |
| `init`          | устаревший алиас `create` для текущего каталога               |

`pulsar build` пишет `dist/<name>` — один исполняемый файл со встроенным
рантаймом Bun, вашим приложением и (если не `--slim`) рантаймом Qt. Запуск:
`./dist/<name>`.

## Манифест — `pulsar.json`

Один файл управляет конфигурацией приложения и упаковкой.

```json
{
  "id": "com.example.myapp",
  "name": "my-app",
  "version": "0.1.0",
  "main": "main.ts",
  "icons": { "linux": "assets/icon.png", "macos": "assets/icon.icns", "windows": "assets/icon.ico" },
  "windows": [
    {
      "label": "main",
      "ui": "ui/main.qml",
      "width": 800,
      "height": 600,
      "title": "My App",
      "minWidth": 400,
      "minHeight": 300,
      "resizable": true,
      "frameless": false,
      "icon": "assets/icon.png"
    }
  ],
  "permissions": [],
  "protocols": [{ "scheme": "myapp" }],
  "singleInstance": true
}
```

| Поле             | Значение                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | Reverse-DNS идентификатор; используется для каталогов data/config/cache приложения.                                                            |
| `name`           | Отображаемое имя/имя вывода (оно же имя файла `dist/<name>`).                                                                                  |
| `version`        | Версия приложения.                                                                                                                             |
| `main`           | Точка входа бэкенда относительно манифеста (по умолчанию `main.ts`).                                                                           |
| `icons`          | Пути к иконкам по платформам (используются упаковкой).                                                                                         |
| `windows[]`      | Стартовые окна: `label`, `ui`, `width`, `height`, `title`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `resizable`, `frameless`, `icon`. |
| `permissions`    | Зарезервировано (пока не применяется).                                                                                                         |
| `protocols`      | Зарезервировано: свои URL-схемы.                                                                                                               |
| `singleInstance` | Зарезервировано: поведение единственного экземпляра.                                                                                           |

`App` берёт конфиг из первого окна манифеста; явные параметры, переданные в
`new App({...})`, переопределяют манифест.

## App API (бэкенд / TypeScript)

```ts
import {
  App,
  Store,
  WindowHandle,
  fs,
  net,
  paths,
  shell,
  storage,
  dialog,
  tray,
  callCapability,
  registerCapability,
} from "pulsar"
```

### App

| Член                 | Описание                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| `new App(config?)`   | Создать приложение. Конфиг берётся из `pulsar.json`; `config` переопределяет. |
| `app.store`          | Реактивное состояние, общее для всех окон (см. `Store`).                      |
| `app.on(event, fn)`  | Подписаться на событие из QML (`Pulsar.emit`) или от хоста.                   |
| `app.window(label?)` | Получить `WindowHandle` (по умолчанию — первое окно).                         |
| `app.windows`        | Все объявленные окна.                                                         |
| `app.config`         | Конфиг первого окна.                                                          |
| `app.manifest`       | Разобранный `pulsar.json` (или `null`).                                       |
| `app.quit()`         | Завершить приложение.                                                         |
| `app.run()`          | Заглушка-маркер; цикл событий принадлежит хосту.                              |

### Store

JSON-безопасная реактивная карта. Любое изменение отправляется в QML как
`Store.<key>`.

```ts
app.store.set("count", 0)
app.store.get("count") // unknown -> приведение типа
app.store.has("count")
app.store.delete("count")
app.store.keys()
app.store.set("items", [{ id: 1 }, { id: 2 }])
```

Разрешены только JSON-сериализуемые значения (объекты, массивы, строки,
конечные числа, булевы, `null`). Всё остальное бросает понятную ошибку;
вместо установки `undefined` используйте `delete`. Циклические ссылки
отклоняются.

### Окна

```ts
const panel = app.window("panel")

await panel.show()
await panel.hide()
await panel.close()
await panel.focus()
await panel.minimize()
await panel.maximize()
await panel.restore()
await panel.setTitle("Panel")
await panel.setSize(360, 260)
await panel.setPosition(100, 100)
await panel.setFullscreen(true)
await panel.setAlwaysOnTop(true)
```

Каждый метод возвращает `Promise<boolean>`.

### События жизненного цикла

```ts
app.on("window-close", (params: { label?: string }) => console.log("closed", params.label))
app.on("window-all-closed", () => app.quit())
```

### Диалоги

Нативные, реализованы Qt-хостом.

```ts
import { dialog } from "pulsar"

const path = await dialog.openFile({ title: "Open", filter: "Images (*.png *.jpg);;All files (*)" })
if (path) app.store.set("picked", path)

const saveTo = await dialog.saveFile({ title: "Save as" })
await dialog.message({ title: "Pulsar", text: "Done!" })
```

### Трей

```ts
import { tray } from "pulsar"

await tray.setIcon((process.env.PULSAR_APP ?? ".") + "/assets/icon.png")
await tray.setTooltip("My App")
await tray.setMenu([{ label: "Show", event: "show" }, { separator: true }, { label: "Quit", event: "quit" }])

app.on("tray-menu", (data: { event?: string }) => {
  if (data.event === "show") app.window().show()
  if (data.event === "quit") app.quit()
})
```

Трей шлёт `tray-menu` (`{ event }`) при клике по пункту и `tray-activated`
(`{ reason }`) при активации иконки.

### Файловая система, пути, сеть, shell, хранилище

```ts
import { fs, paths, net, shell, storage } from "pulsar"

const text = await fs.readFile("notes.txt")
await fs.writeFile("notes.txt", "hello")
const entries = await fs.listDir(".")
const exists = await fs.exists("notes.txt")

const dirs = await paths.get() // { data, config, cache, temp, home }

const res = await net.fetch("https://example.com") // { status, url, text }

await shell.open("https://github.com/riclud/pulsar")
await shell.notify("Pulsar", "Build finished")

await storage.set("todos", [{ id: 1, text: "write docs" }])
const todos = await storage.get("todos")
await storage.remove("todos")
```

Хранилище сохраняет JSON-безопасные значения в `storage.json` в каталоге
данных приложения. `paths` возвращает стандартные каталоги по ОС:

| ОС      | data/config                                    | cache                       |
| ------- | ---------------------------------------------- | --------------------------- |
| Linux   | `$XDG_DATA_HOME/<id>`, `$XDG_CONFIG_HOME/<id>` | `$XDG_CACHE_HOME/<id>`      |
| macOS   | `~/Library/Application Support/<id>`           | `~/Library/Caches/<id>`     |
| Windows | `%APPDATA%\<id>`                               | `%LOCALAPPDATA%\<id>\cache` |

### Логирование

```ts
console.log("hello") // -> stderr, а также пробрасывается в QML
console.error("oops") // уровни: log, info, debug, warn, error
```

Логи приложения также отправляются в QML через сигнал `log`. Сообщения
`console.*` из QML пробрасываются обратно в приложение как событие `log`:

```ts
app.on("log", (params: { level: string; source: "qml" | "js"; message: string; file?: string; line?: number }) => {
  // source == "qml" для сообщений из интерфейса
})
```

## QML API

```qml
import Pulsar 1.0   // синглтоны Pulsar и Store
```

### `Pulsar`

| Метод                                                                                                          | Описание                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Pulsar.emit(name, params)`                                                                                    | Послать событие в приложение (`app.on(name, ...)`).                                                         |
| `Pulsar.call(name, params)`                                                                                    | Вызвать событие/capability; возвращает Promise (напр. `Pulsar.call("fs.exists", { path: "." }).then(...)`). |
| `Pulsar.openFile(title, filter, dir)`                                                                          | Нативный диалог открытия; возвращает путь (синхронно).                                                      |
| `Pulsar.saveFile(title, filter, dir)`                                                                          | Нативный диалог сохранения; возвращает путь.                                                                |
| `Pulsar.message(title, text)`                                                                                  | Нативное окно сообщения.                                                                                    |
| `Pulsar.clipboardText()` / `Pulsar.clipboardWrite(text)`                                                       | Буфер обмена.                                                                                               |
| `Pulsar.trayAvailable()`                                                                                       | Доступен ли системный трей.                                                                                 |
| `Pulsar.setTrayIcon(path)` / `Pulsar.setTrayTooltip(text)` / `Pulsar.setTrayMenu(items)` / `Pulsar.hideTray()` | Управление треем.                                                                                           |
| `Pulsar.diagnostics()`                                                                                         | Отладочная строка.                                                                                          |
| `Pulsar.restart()`                                                                                             | Перезапустить бэкенд (dev).                                                                                 |

Сигнал `log(level, message, source)` — подписка через `Connections`.

### `Store`

`Store.<key>` реактивно отражает каждое значение `app.store`:

```qml
Label { text: "Count: " + (Store.count ?? 0) }
Grid { model: Store.photos; delegate: Image { required property var modelData; source: modelData.url } }
```

### Несколько окон

```ts
// main.ts
app.on("togglePanel", async () => {
  const open = app.store.get("panelOpen") as boolean
  const panel = app.window("panel")
  await (open ? panel.hide() : panel.show())
  app.store.set("panelOpen", !open)
})
```

```qml
// panel.qml
Button {
    text: "Close me"
    onClicked: Pulsar.call("window", { label: "panel", action: "close" })
}
```

## Шаблоны

`pulsar create <name> --template <t>`:

- **`default`** — одно окно, `Store`, одно событие.
- **`windows`** — два окна с общим `Store`, управление через
  `app.window(label)`, события жизненного цикла, иконка трея и
  нативные диалоги.
- **`tray`** — окно плюс меню в системном трее.

Полные приложения см. в [`examples/hello`](../examples/hello) и
[`examples/windows`](../examples/windows).

## Сборка из исходников

Требования: Bun, CMake (≥ 3.21), компилятор C++20 и dev-файлы Qt 6.8+.

```sh
# Debian/Ubuntu
sudo apt install g++ cmake qt6-base-dev qt6-base-dev-tools qt6-declarative-dev \
  qml6-module-qtquick qml6-module-qtquick-controls

# Fedora
sudo dnf install gcc-c++ cmake qt6-qtbase-devel qt6-qtdeclarative-devel

# Arch
sudo pacman -S base-devel cmake qt6-base qt6-declarative qt6-quickcontrols2

# macOS
brew install cmake qt
```

Затем:

```sh
bun install
cmake -S . -B build && cmake --build build
```

Сборка создаёт:

- `build/bin/qml-host` — Qt-хост (рендерит QML, нативные диалоги/трей);
- `build/bin/bridge` — супервизор процессов на C++ для рантайма;
- `build/bin/launcher` — лончер без Qt для однофайловых приложений.

Qt ищется через CMake `find_package(Qt6)`, поэтому при нестандартном пути
передай `-DCMAKE_PREFIX_PATH=<qt>`. `PULSAR_QMAKE` по-прежнему задаёт `qmake`
для упаковки (`pulsar build` встраивает Qt).

### Раскладка одного файла

`pulsar build` дописывает payload к `launcher`:

```
[ launcher ][ контейнер payload ][ смещение payload + магия ]
             ├─ bin/qml-host, bin/bridge, bin/qt.conf
             ├─ runtime                  (Bun standalone: рантайм + приложение + SDK)
             ├─ app/…                     (QML, ассеты, манифест)
             └─ lib/Qt/…                  (встроенный Qt: либы, плагины, QML-модули)
```

При запуске лончер распаковывает payload в кэш пользователя и делает `exec`
хоста, который загружает Qt из `lib/Qt` по своему RPATH — никогда из
системы. Используйте `--slim`, чтобы не класть Qt и опираться на системную
установку.

## Протокол

Хост и рантайм обмениваются JSON-RPC построчно по stdio. Рантайм объявляет себя
handshake-сообщением `__hello` (версия протокола, рантайм, capabilities), работает
через абстракцию `Transport`, а бинарный/потоковый data-канал зарезервирован
отдельно от JSON control-канала. См. [`protocol.md`](protocol.md).

## Структура репозитория

```
cli/        CLI (create/install/update/doctor), шаблоны проектов
core/       рантайм + SDK
  caps/     встроенные capabilities (fs, net, paths, shell, storage)
  runtime/  рантайм Bun, который общается с хостом
  sdk/      пакет `pulsar`, который импортируют приложения
host/       хост на C++/Qt: QML-движок, диалоги, трей, управление окнами
bridge/     супервизор на C++ (запускает Bun, сообщает о падениях, проксирует stdio)
launcher/   лончер на C++ без Qt для однофайловых приложений
examples/   примеры приложений
tests/      фикстуры для smoke-теста
scripts/    хелперы сборки/smoke/форматирования/релиза
install.sh, install.ps1   bootstrap-установщики
```

## Тестирование

```sh
bun run test        # unit-тесты + headless smoke-тест
bun run typecheck
bun run fmt:check
```

## Лицензия

MIT — см. [`LICENSE`](../LICENSE). Pulsar динамически линкует Qt (LGPL-3.0);
см. [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Приложения,
собранные с `--slim`, требуют собственной установки Qt у пользователя.
