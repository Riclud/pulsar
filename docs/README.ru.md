<p align="center">
  <a href="../README.md">English</a> ·
  <strong>Русский</strong>
</p>

# Pulsar

Фреймворк для приложений с декларативным интерфейсом на **TypeScript** и
бэкендом на **Bun**. На десктопе поставляется одним самодостаточным исполняемым
файлом, на Android собирается APK, где QuickJS работает в одном процессе.
QML доступен как escape hatch для продвинутой вёрстки.

- **Интерфейс**: функциональные компоненты, биндинги и `Store` на TypeScript;
  рендерится нативно через QML (GPU, низкое потребление памяти — без Chromium).
- **Бэкенд**: TypeScript на [Bun](https://bun.sh).
- **Мост**: слой capabilities между интерфейсом и бэкендом плюс небольшой
  Qt-хост и супервизор процессов на C++.
- **Упаковка**: `pulsar build` собирает один файл со встроенным рантаймом Bun
  (а по умолчанию — и Qt); `pulsar build --target android` собирает подписанный
  APK.

## Платформы

| Платформа           | Ассеты релиза | Статус                  |
| ------------------- | ------------- | ----------------------- |
| Linux x64           | да            | проверено               |
| Linux ARM64         | да            | собрано в CI            |
| macOS Apple Silicon | да            | проверено               |
| macOS Intel         | да            | собрано в CI            |
| Windows x64         | да            | проверено               |
| Windows ARM64       | да            | собрано в CI            |
| Android ARM64       | только APK    | проверено на устройстве |

iOS пока не поддерживается. «Собрано в CI» значит, что toolchain и ассеты
собираются и упаковываются, но на реальном железе их никто не запускал.

История релизов — в [CHANGELOG.md](../CHANGELOG.md).

## Требования

- **[Bun](https://bun.sh) ≥ 1.2** — на нём работают CLI и каждое приложение.
- **Qt 6.8+** (на macOS — Qt **6.9.2+**: более старые 6.8.x линкуют удалённый
  фреймворк AGL) — только если вы собираете хост из исходников или используете
  `--slim`-toolchain (`pulsar build --slim` / `pulsar install --slim`).
  Обычный toolchain и сборки содержат Qt, так что конечному пользователю
  ничего ставить не нужно; его платформенные зависимости (X11/Wayland,
  шрифты, драйверы GPU) по-прежнему берутся из системы. Для сборки из
  исходников нужен ещё модуль Qt WebSockets.

## Установка

### Из релиза (рекомендуется)

Готовые ассеты публикуются для всех десктопных целей из таблицы выше.

Linux / macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/riclud/pulsar/main/install.sh | sh
pulsar install          # скачивает нативный toolchain (host + bridge + Qt)
```

Windows:

```powershell
iwr https://raw.githubusercontent.com/riclud/pulsar/main/install.ps1 -UseBasicParsing | iex
pulsar install
```

Bootstrap ставит CLI в `~/.local/share/pulsar` (или `%LOCALAPPDATA%\pulsar` в
Windows) и шим `pulsar` в `PATH`. Затем `pulsar install` скачивает toolchain
для платформы:

- по умолчанию: **fat** — со встроенным Qt, без настройки. Хост грузит Qt из
  бандла (через RPATH в Linux/macOS, либо из DLL рядом с exe в Windows), поэтому
  системный Qt не используется;
- `--slim` — без Qt, использует системный.

Toolchain скачивается с GitHub Releases вместе с CLI; отдельно Qt не
устанавливается. Системный Qt 6.8+ нужен только при сборке фреймворка из
исходников или в режиме `--slim`.

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
pulsar create my-app      # по умолчанию UI на TypeScript (шаблоны: default, qml, windows, tray)
cd my-app
pulsar dev                # запуск с горячей перезагрузкой
```

Структура `my-app`:

```
my-app/
  pulsar.json     # манифест приложения: id, окна, точка входа
  main.ts         # интерфейс + состояние + события, всё на TypeScript
  assets/icon.png
  package.json
  tsconfig.json
```

`main.ts`:

```ts
import { App, bind, Button, Column, Header, Text } from "pulsar"

const app = new App()

app.store.set("count", 0)

app
  .window("main")
  .render(() =>
    Column(
      { fill: true },
      Header({ title: "Hello from Pulsar" }),
      Text({ size: 20, text: bind(() => `Count: ${app.store.get("count")}`) }),
      Button({ onClick: () => app.store.set("count", (app.store.get("count") as number) + 1) }, "+1"),
    ),
  )

app.run()
```

QML-файлов нет. `pulsar.json` задаёт параметры окна по умолчанию, поэтому
`new App()` можно вызывать без аргументов. Продвинутые пользователи могут
переключить окно на QML через `"ui": "ui/main.qml"` и начать с
`pulsar create my-app --template qml`.

## CLI

```
pulsar <command>

  create <name>  создать новое приложение (--template default|js|qml|windows|tray)
  install        скачать нативный toolchain для этой платформы (--android для APK)
  update         обновить CLI до последнего релиза
  dev            запуск с горячей перезагрузкой (следит за исходниками)
  run            запустить приложение в текущем каталоге
  build          собрать один исполняемый файл (--target desktop|android|portable)
  doctor         проверить toolchain (host, bridge, Qt, Bun)
  version        показать версию
  help           показать справку
```

Полезные флаги и алиасы:

| Команда         | Флаги                                                         |
| --------------- | ------------------------------------------------------------- |
| `create <name>` | `--template <t>`, `--dir <path>`, `--force`                   |
| `install`       | `--version <v>\|latest`, `--slim`, `--android`                |
| `build`         | `--out <dir>` / `-o <dir>`, `--slim`, `--target`, `--abi`     |
| `run`, `dev`    | env `PULSAR_APP` (каталог приложения), `PULSAR_WATCH` (`dev`) |
| `init`          | устаревший алиас `create` для текущего каталога               |

`pulsar build` пишет `dist/<name>` — один исполняемый файл со встроенным
рантаймом Bun, вашим приложением и (если не `--slim`) рантаймом Qt. Запуск:
`./dist/<name>`.

### Android

На Android QuickJS и QML-хост работают в одном процессе, поэтому код должен быть
портативным: добавьте в `pulsar.json` `"targets": ["android"]` и
`"compat": "portable"`, затем:

```sh
pulsar build --target android
```

Первая сборка сама ставит в `PULSAR_HOME` всё нужное (один раз, ~2 ГБ): JDK 17,
Android SDK/NDK и бандл Qt for Android с host-инструментами. Результат —
`dist/<name>.apk` для `arm64-v8a` (minSdk 28, targetSdk 35).
`pulsar install --android` делает ту же установку без сборки, а
`pulsar check --target android` отсекает `node:`/`bun:` импорты до упаковки.

`net.fetch` и потоковый `net.request` работают на Android: транспорт выполняется
в нативном хосте через QtNetwork. `net.websocket` требует модуль Qt WebSockets,
которого нет в текущем бандле Qt for Android: на устройстве вызов вернёт
`ERR_UNSUPPORTED` (на десктопе всё работает).

#### Dev-цикл на Android

```sh
pulsar dev --android
```

Первый запуск собирает dev-APK (`applicationId <id>.dev`, имя
`<name> (dev)`) и ставит его рядом с production. CLI поднимает сервер бандла,
прокидывает его на устройство через `adb reverse`, следит за каталогом
приложения и перезапускает его после правки (1–2 с). Нативные входы (C++ хоста,
манифест, CMake, id приложения) хешируются; при их изменении APK пересобирается
и переустанавливается. Флаги: `--device <serial>`, `--port <n>`,
`--no-install`, `--force-install`, `--no-keep-awake`.

Пока он запущен, из другого терминала можно смотреть и нажимать:

```sh
pulsar ui                 # дерево UI (JSON)
pulsar state              # снимок store (JSON)
pulsar tap "Добавить"     # нажатие по тексту, пути или id
pulsar type "молоко" --into "Новая задача"
pulsar expect "молоко"    # ждать текст
pulsar shot --out shot.png
pulsar tap --at 540,1200          # координаты (QML-приложения, системный UI)
pulsar swipe 500 1200 500 400 --duration 250
pulsar key back                   # back, home, enter, ... или числовой код
pulsar ui --system                # uiautomator-дамп переднего плана
pulsar eval "6*7"                 # выполнить JS в работающем QuickJS
```

`pulsar shot` снимает весь экран через `adb`; `--window` снимает только окно
приложения по dev-каналу. Семантическим командам нужно дерево JS UI, поэтому
они работают для JS-окон, а не для приложений с `ui/main.qml`. `pulsar ui
--system` показывает дамп переднего окна (удобно для permission-диалогов), а
`--at`/`swipe`/`key` работают по координатам.

Флоу-тесты могут использовать host API:

```ts
import { connect } from "../../cli/testing.ts"

const app = connect()

await app.tap({ text: "Добавить" })
await app.expect("1 задача")
await app.shot(".pulsar/shots/after.png")
```

Запуск: `bun flows/todo.ts`, пока работает `pulsar dev --android`.

Необработанная ошибка показывает полноэкранный overlay с кнопкой Reload. Пока
запущен dev-сервер, стек маппится обратно в ваши `.ts`-файлы и в терминале,
и в overlay.

Правки перезагружают приложение внутри процесса (~200 мс на устройстве):
JS-рантайм пересоздаётся, а store заполняется состоянием прошлой сессии.
JS-окна сохраняют свой view, QML-окна перезагружаются из `ui/main.qml`.
Так как store сохраняется, изменение начального `app.store.set` в коде
применится только после полного перезапуска (`pulsar dev` заново).

## Манифест — `pulsar.json`

Один файл управляет конфигурацией приложения и упаковкой.

```json
{
  "id": "com.example.myapp",
  "name": "my-app",
  "version": "1.0.0",
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
  "fileAssociations": [{ "ext": "md", "mime": "text/markdown", "name": "Markdown document" }],
  "protocols": [{ "scheme": "myapp" }],
  "singleInstance": true
}
```

| Поле               | Значение                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Reverse-DNS идентификатор; используется для каталогов data/config/cache приложения.                                                            |
| `name`             | Отображаемое имя/имя вывода (оно же имя файла `dist/<name>`).                                                                                  |
| `version`          | Версия приложения.                                                                                                                             |
| `main`             | Точка входа бэкенда относительно манифеста (по умолчанию `main.ts`).                                                                           |
| `icons`            | Пути к иконкам по платформам (используются упаковкой).                                                                                         |
| `windows[]`        | Стартовые окна: `label`, `ui`, `width`, `height`, `title`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `resizable`, `frameless`, `icon`. |
| `permissions`      | Возможности, доступные приложению (см. [Разрешения](#разрешения)). Нет поля — все.                                                             |
| `protocols`        | Свои URL-схемы (deep links), которые обрабатывает приложение.                                                                                  |
| `fileAssociations` | Типы файлов, которые открывает приложение: `ext` (без точки), `mime`, `name`.                                                                  |
| `singleInstance`   | Передавать второй запуск работающему экземпляру и выходить (по умолчанию `false`).                                                             |
| `ignore`           | Дополнительные пути, не попадающие в сборку, в синтаксисе `.gitignore`.                                                                        |

Сборка всегда пропускает `.git`, `node_modules`, `dist`, `build`, `.cache`,
`.pulsar`, `.env*` и `sync.db*`, а также учитывает корневой `.gitignore`
приложения. `ignore` добавляет шаблоны сверх этого; строка с `!` возвращает
путь, исключённый через `.gitignore`, но не встроенные исключения.

`App` берёт конфиг из первого окна манифеста; явные параметры, переданные в
`new App({...})`, переопределяют манифест.

### Разрешения

`permissions` объявляет возможности ОС, которые доступны приложению. Если поля
**нет** — разрешено всё; если оно **есть** — только перечисленное, а любой
другой вызов возможности завершается ошибкой `permission denied`.

```json
{ "permissions": ["fs", "net", "dialog"] }
```

| Разрешение | Что даёт                                    |
| ---------- | ------------------------------------------- |
| `fs`       | чтение/запись файлов, stat, rename, корзина |
| `net`      | `net.fetch`, `net.request`, `net.websocket` |
| `paths`    | стандартные каталоги приложения             |
| `shell`    | открытие URL в приложении по умолчанию      |
| `notify`   | системные уведомления                       |
| `dialog`   | системные файловые/сообщающие диалоги       |
| `screen`   | список мониторов                            |
| `theme`    | системная цветовая схема                    |
| `system`   | локаль/язык/часовой пояс                    |
| `storage`  | JSON-файл хранилища приложения              |
| `secure`   | системный keychain / хранилище секретов     |
| `tray`     | иконка и меню трея                          |

Управление окнами — ядро и не ограничивается. Пользовательские возможности,
зарегистрированные приложением, тоже не ограничиваются.

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
  secureStorage,
  dialog,
  notify,
  screen,
  system,
  theme,
  tray,
  callCapability,
  registerCapability,
} from "pulsar"
```

### App

| Член                                 | Описание                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `new App(config?)`                   | Создать приложение. Конфиг берётся из `pulsar.json`; `config` переопределяет. |
| `app.store`                          | Реактивное состояние, общее для всех окон (см. `Store`).                      |
| `app.on(event, fn)`                  | Подписаться на событие из QML (`Pulsar.emit`), хоста или `app.send`.          |
| `app.window(label?)`                 | Получить `WindowHandle` (по умолчанию — первое окно).                         |
| `app.createWindow(config)`           | Создать окно в рантайме; возвращает `WindowHandle`.                           |
| `app.closeWindow(label?)`            | Закрыть окно (по умолчанию — первое).                                         |
| `app.send(event, payload?, target?)` | Отправить событие в UI (`target` — метка или `*`).                            |
| `app.windows`                        | Все открытые окна (стартовые плюс созданные).                                 |
| `app.config`                         | Конфиг первого окна.                                                          |
| `app.manifest`                       | Разобранный `pulsar.json` (или `null`).                                       |
| `app.quit()`                         | Завершить приложение.                                                         |
| `app.run()`                          | Заглушка-маркер; цикл событий принадлежит хосту.                              |

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

Если новое значение глубоко равно текущему, `set` ничего не делает: слушатели
не вызываются, в UI ничего не отправляется и перерисовки нет. Поэтому цикл
синхронизации по таймеру не перестраивает список, когда данных не изменились.
Ключи, добавленные после открытия окна, доставляются как обычно; привязывайте
их напрямую (`Store.<key>`), чтобы QML отслеживал их.

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
await panel.destroy() // закрыть и освободить окно
```

Каждый метод возвращает `Promise<boolean>`. Окна из `pulsar.json` — лишь
стартовые; остальные можно создавать в рантайме:

```ts
const settings = app.createWindow({ label: "settings", ui: "ui/settings.qml", width: 420, height: 320 })
await settings.show()
```

### События жизненного цикла

Хост сообщает приложению об активности окон и трея:

```ts
app.on("window-close", (params) => console.log("closed", params.label))
app.on("window-state", (params) => console.log(params.label, params.state)) // normal|minimized|maximized|fullscreen
app.on("window-resize", (params) => console.log(params.label, params.width, params.height))
app.on("window-move", (params) => console.log(params.label, params.x, params.y))
app.on("window-focus", () => {})
app.on("window-blur", () => {})
app.on("window-all-closed", () => app.quit())
```

На Android приложение также получает события переднего плана и кнопки «назад»:

```ts
app.on("app-pause", (params) => saveDraft(params.state)) // "inactive" | "suspended"
app.on("app-resume", () => refresh())
app.on("app-stop", () => {}) // ушли в фон; Android может убить процесс
app.on("back-pressed", () => closeDialog()) // без слушателя back закрывает приложение
```

`app-pause` со `state: "inactive"` приходит и на диалоги и шторку уведомлений,
поэтому сохраняйте состояние там (или на `app-stop`): Android может убить
процесс в фоне без дальнейших колбэков. Пока открыта экранная клавиатура,
первый back только прячет её. На desktop эти события не приходят.

### Аргументы запуска и deep links

Файлы и URL, которые ОС передаёт приложению (аргументы командной строки или
macOS-событие открытия файла), приходят событиями:

```ts
app.on("open-file", (params) => console.log("open", params.path))
app.on("open-url", (params) => console.log("deep link", params.url))
```

С `singleInstance: true` в `pulsar.json` работает только один экземпляр: второй
запуск передаёт свои аргументы работающему и выходит. Работающее приложение
получает событие `second-instance`, чтобы поднять окно:

```ts
app.on("second-instance", (params) => {
  app.window().focus()
  console.log("relaunched with", params.argv)
})
```

### Недавние документы

Сообщите ОС, какие файлы открыл пользователь: они появятся в системных
списках недавних (Jump List в Windows, список приложения в macOS,
`recently-used.xbel` в Linux):

```ts
app.addRecentDocument("/home/me/notes.md")
app.clearRecentDocuments()
```

Пути приводятся к абсолютным. Очистка опустошает список приложения (в Linux
сбрасывается общий `recently-used.xbel`).

### Ассоциации файлов

Объявите типы файлов, которые открывает приложение, в `pulsar.json`:

```json
"fileAssociations": [
  { "ext": "md", "mime": "text/markdown", "name": "Markdown document" }
]
```

Хост регистрирует их при запуске идемпотентно: в Linux пишет desktop-файл в
`$XDG_DATA_HOME/applications` и значение по умолчанию в
`$XDG_CONFIG_HOME/mimeapps.list` (поэтому там обязателен `mime`); в Windows
добавляет приложение в `OpenWithProgids` под `HKCU\Software\Classes`. В macOS
типы файлов принадлежат app bundle, поэтому single-file сборки это поле
игнорируют — для deep links используйте `protocols`.

### События из бэкенда в UI

`app.send(event, payload, target?)` отправляет разовое событие в UI (`target` —
метка окна или `*` для всех). `app.window(label).emit(...)` — в одно окно.
В QML подписка идёт через singleton `Pulsar`, а фильтр по окну — через
контекстное свойство `PulsarWindowLabel`:

```ts
app.send("update-ready", { version: "0.2.0" })
```

```qml
Connections {
    target: Pulsar
    function onAppEvent(event, payload, target) {
        if (target === "*" || target === PulsarWindowLabel)
            if (event === "update-ready") banner.text = "Update " + payload.version
    }
}
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

const text = await fs.readFile("notes.txt") // utf8 по умолчанию
await fs.writeFile("notes.txt", "hello")
await fs.appendFile("notes.txt", " world")
const entries = await fs.listDir(".")
const exists = await fs.exists("notes.txt")
const info = await fs.stat("notes.txt") // { size, isFile, isDirectory, mtimeMs, createdAtMs }

await fs.mkdir("data/sub", true)
await fs.rename("a.txt", "b.txt")
await fs.copy("b.txt", "copy.txt")
await fs.remove("copy.txt") // рекурсивно: fs.remove(path, true)
await fs.moveToTrash("b.txt")

await fs.open("report.pdf") // открыть приложением по умолчанию
await fs.exportTo("report.pdf", "report.pdf") // скопировать в Downloads

const bytes = await fs.readFile("logo.png", "base64") // бинарные данные как base64
await fs.writeFile("logo.png", bytes, "base64")

const dirs = await paths.get() // { data, config, cache, temp, home }

const res = await net.fetch("https://api.example.com/items") // { status, statusText, url, headers, text }
const created = await net.fetch("https://api.example.com/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "demo" }),
})
const logo = await net.fetch("https://example.com/logo.png", { responseType: "binary" })
logo.bytes // Uint8Array

await shell.open("https://github.com/riclud/pulsar")

await storage.set("todos", [{ id: 1, text: "write docs" }])
const todos = await storage.get("todos")
await storage.remove("todos")
```

`net.fetch(url, options)` выполняется в нативном хосте, а не в JS-движке,
поэтому одинаково работает под Bun, Node, Hermes и QuickJS. Опции: `method`,
`headers`, `body` (строка или `Uint8Array`), `timeoutMs`, `redirect` (`follow` /
`manual` / `error`), `maxRedirects`, `responseType` (`text` / `binary` / `auto`)
и `tlsFingerprint`. `tlsFingerprint: true` (или профиль вроде `"chrome120"`)
зарезервирован под бэкенд с маскировкой; сборки без него отвечают
`ERR_FINGERPRINT_UNAVAILABLE`.

Для стриминга используйте `net.request(url, options)`: события `response`,
`data` (строка или `Uint8Array`), `end`, `error` и метод `abort()`:

```ts
const request = net.request("https://example.com/big.bin")
request.on("data", (chunk) => console.log(chunk))
request.on("end", () => console.log("done"))
request.on("error", (error) => console.error(error.code, error.message))
```

`net.websocket(url, options)` открывает соединение `ws://` или `wss://` в
нативном хосте. Опции: `headers`, `protocols` (сабпротоколы) и `timeoutMs`
(таймаут подключения, по умолчанию 30 с). Сообщения — строки или `Uint8Array`:

```ts
const socket = net.websocket("wss://example.com/ws", { protocols: ["chat"] })

socket.on("open", (info) => console.log("connected", info.protocol))
socket.on("message", (data) => console.log(typeof data === "string" ? data : data.byteLength))
socket.on("close", (info) => console.log(info.code, info.reason, info.wasClean))
socket.on("error", (error) => console.error(error.code, error.message))

socket.send("hello")
socket.send(new Uint8Array([1, 2, 3]))
socket.close(1000, "bye")
```

`fs.open(path)` отдаёт файл ОС: приложению по умолчанию на десктопе
(`QDesktopServices`) или `ACTION_VIEW` на Android, где видео открывается во
встроенном полноэкранном плеере. `fs.exportTo(path, name?)` копирует файл из
песочницы приложения в папку Downloads; на Android открывается диалог
сохранения SAF и возвращается `true` после успешного копирования. Оба метода
возвращают `Promise<boolean>`. `dialog.toast(text)` показывает короткий тост
на Android; на десктопе это no-op, который резолвится в `true`.

Нативные диалоги — в `dialog`:

```ts
import { dialog } from "pulsar"

const one = await dialog.openFile({ title: "Открыть", filter: "Images (*.png *.jpg);;All files (*)" })
const many = await dialog.openFiles({ title: "Выбрать несколько" })
const dir = await dialog.openDirectory({ title: "Выбрать папку" })
const saveTo = await dialog.saveFile({ title: "Сохранить как" })
await dialog.message({ title: "Pulsar", text: "Готово!" })
await dialog.toast("Сохранено")
```

### Уведомления, экраны, тема, локаль

```ts
import { notify, screen, system, theme } from "pulsar"

const token = await notify.show({ title: "Pulsar", body: "Сборка завершена" })
app.on("notification-click", (data) => {
  if (data.token === token) app.window().focus()
})

const screens = await screen.list() // [{ name, x, y, width, height, workArea, scale, primary }]
const mainScreen = await screen.primary()

const { scheme } = await theme.current() // "light" | "dark"
app.on("theme-changed", (data) => console.log("теперь", data.scheme))

const { locale, language, timezone } = await system.locale()
```

Хранилище сохраняет JSON-безопасные значения в `storage.json` в каталоге
данных приложения. `paths` возвращает стандартные каталоги по ОС:

| ОС      | data/config                                    | cache                       |
| ------- | ---------------------------------------------- | --------------------------- |
| Linux   | `$XDG_DATA_HOME/<id>`, `$XDG_CONFIG_HOME/<id>` | `$XDG_CACHE_HOME/<id>`      |
| macOS   | `~/Library/Application Support/<id>`           | `~/Library/Caches/<id>`     |
| Windows | `%APPDATA%\<id>`                               | `%LOCALAPPDATA%\<id>\cache` |

### Секреты (системный keychain)

`secureStorage` хранит строки в системном хранилище секретов: Keychain в
macOS, DPAPI в Windows и libsecret (`secret-tool`) в Linux. Записи привязаны к
`id` приложения, поэтому приложения не видят чужие значения.

```ts
import { secureStorage } from "pulsar"

if (await secureStorage.available()) {
  await secureStorage.set("api-token", token)
  const saved = await secureStorage.get("api-token") // string | null
  await secureStorage.remove("api-token")
} else {
  // Linux без libsecret: используйте обычное JSON-хранилище.
}
```

`available()` возвращает `false`, если бэкенда нет (обычно Linux без
`secret-tool`). Значения — строки UTF-8; объекты сначала сериализуйте в JSON.
В Windows данные шифруются DPAPI для текущего пользователя; в macOS и Linux
доступ контролирует системный keychain.

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

## UI на TypeScript

Окно, объявленное **без `ui`**, рендерится из дерева на TypeScript.
`pulsar create my-app` создаёт ровно такое приложение — без единого QML-файла.
Компоненты — обычные функции, свойства — обычные объекты, события — web-имена:
`onClick`, `onInput`, `onToggle`, `onChange`, `onClose`.

```ts
import {
  App,
  bind,
  defineComponent,
  Button,
  Card,
  Checkbox,
  Column,
  For,
  Header,
  IconButton,
  Input,
  Modal,
  Row,
  Spacer,
  Text,
} from "pulsar"

interface Task {
  id: string
  text: string
  done: boolean
}

const app = new App()

app.store.set("tasks", [
  { id: "1", text: "Try the JS UI", done: true },
  { id: "2", text: "Write my first app", done: false },
] as Task[])

const tasks = (): Task[] => app.store.get("tasks") as Task[]

const TaskRow = defineComponent<{ task: Task }>(({ task }) =>
  Card(
    { padding: 12 },
    Row(
      { gap: 8, fillWidth: true },
      Checkbox({
        label: task.text,
        checked: task.done,
        onToggle: (done) =>
          app.store.set(
            "tasks",
            tasks().map((item) => (item.id === task.id ? { ...item, done } : item)),
          ),
      }),
      Spacer({ fillWidth: true }),
      IconButton({
        icon: "delete",
        onClick: () =>
          app.store.set(
            "tasks",
            tasks().filter((item) => item.id !== task.id),
          ),
      }),
    ),
  ),
)

app.window("main").render(() =>
  Column(
    { fill: true },
    Header({
      title: "My tasks",
      subtitle: bind(() => `${tasks().filter((task) => !task.done).length} left`),
      actions: [IconButton({ icon: "add", onClick: () => app.store.set("editing", true) })],
    }),
    Text({ visible: tasks().length === 0, size: 16 }, "Nothing here yet"),
    For({
      each: tasks(),
      keyOf: (task) => task.id,
      spacing: 8,
      padding: 12,
      render: (task) => TaskRow({ task }),
    }),
    Modal(
      {
        open: bind(() => app.store.get("editing") === true),
        title: "New task",
        fullscreen: true,
        onClose: () => app.store.set("editing", false),
      },
      Input({ placeholder: "What needs doing?" }),
      Button({ expand: true }, "Add task"),
    ),
  ),
)

app.run()
```

`render` принимает дерево или функцию; функция вызывается заново при изменении
`Store`, а хост обновляет существующие QML-объекты на месте, поэтому фокус,
скролл и ввод переживают перерисовку.

| Группа    | Компоненты                                                             |
| --------- | ---------------------------------------------------------------------- |
| Раскладка | `Column`, `Row`, `Box`, `Scroll`, `Spacer`, `Divider`                  |
| Контент   | `Text`, `Image`, `Icon`, `Button`, `IconButton`, `Chip`, `Progress`    |
| Ввод      | `Input` (`TextField`), `Checkbox`, `Switch`, `Slider`, `Select`        |
| Структура | `List` / `For`, `Card`, `Header` (`AppBar`), `Modal` (`Sheet`), `When` |

- `bind(() => expr)` помечает значение, читающее `Store`; обычные функции в
  `on*` — обработчики событий.
- `For({ each, keyOf, render })` строит прокручиваемый список и сохраняет строки по ключу.
- `Modal` / `Sheet` — оверлей внутри дерева, одинаково работает на десктопе и
  Android.
- `Icon` и `IconButton` принимают имена
  [Material Icons](https://fonts.google.com/icons): `add`, `delete`, `edit`,
  `check`, `arrow_back`, `close`.
- Низкоуровневые фабрики `ui.column(...)`, `ui.button(...)` остаются доступны;
  компоненты выше — тонкие обёртки над ними.
- QML-окна работают как раньше — можно смешивать.

## QML API (escape hatch)

QML не обязателен. Продвинутые пользователи могут указать
`"ui": "ui/main.qml"` и использовать полный QML API ниже; `Store` и
capabilities те же.

```qml
import Pulsar 1.0   // синглтоны Pulsar и Store
```

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

Сигналы: `log(level, message, source)`, `appEvent(event, payload, target)` и
`colorSchemeChanged` — подписка через `Connections`. Каждое окно также получает
контекстное свойство `PulsarWindowLabel` со своей меткой. Свойство
`Pulsar.colorScheme` равно `"light"`/`"dark"`.

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

- **`default`** — UI на TypeScript: функциональные компоненты, биндинги, список
  с ключами, модалка добавления и пустое состояние. Без QML-файлов.
- **`js`** — алиас для `default`.
- **`qml`** — классическое QML-окно; для тех, кому нужен чистый QML (продвинутый
  вариант).
- **`windows`** — два окна с общим `Store`, управление через
  `app.window(label)`, события жизненного цикла, иконка трея и нативные диалоги
  (QML).
- **`tray`** — окно плюс меню в системном трее (QML).

Полные приложения см. в [`examples/hello`](../examples/hello) и
[`examples/windows`](../examples/windows).

## Сборка из исходников

Требования: Bun, CMake (≥ 3.21), компилятор C++20 и dev-файлы Qt 6.9+,
включая модуль WebSockets.

```sh
# Debian/Ubuntu
sudo apt install g++ cmake qt6-base-dev qt6-base-dev-tools qt6-declarative-dev \
  qt6-websockets-dev qml6-module-qtquick qml6-module-qtquick-controls

# Fedora
sudo dnf install gcc-c++ cmake qt6-qtbase-devel qt6-declarative-devel qt6-qtwebsockets-devel

# Arch
sudo pacman -S base-devel cmake qt6-base qt6-declarative qt6-websockets qt6-quickcontrols2

# macOS
brew install cmake qt

# Windows: поставьте Qt 6.9 через онлайн-установщик и передайте -DCMAKE_PREFIX_PATH=<qt>/lib/cmake
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

Релизы собираются CI-матрицей (`.github/workflows/release.yml`) на Linux, macOS
и Windows, с платформенной упаковкой Qt (`ldd` в Linux, `otool` + копирование
фреймворков в macOS, `windeployqt` в Windows).

### Раскладка одного файла

`pulsar build` дописывает payload к `launcher`:

```
[ launcher ][ контейнер payload ][ смещение payload + магия ]
             ├─ bin/qml-host, bin/bridge, bin/qt.conf
             ├─ runtime                  (Bun standalone: рантайм + приложение + SDK)
             ├─ app/…                     (QML, ассеты, манифест)
             └─ lib/Qt/…                  (встроенный Qt, Linux/macOS)
                                          или DLL Qt рядом с хостом в Windows
```

При запуске лончер распаковывает payload в кэш пользователя и делает `exec`
хоста, который грузит собственный Qt — из `lib/Qt` по RPATH в Linux/macOS либо
из DLL рядом с exe в Windows — никогда из системы. Используйте `--slim`, чтобы
не класть Qt и опираться на системную установку.

`pulsar build` переиспользует Qt из установленного toolchain; если у хоста
нет встроенного Qt (dev-сборки), берётся Qt из `qmake`. Переменная
`PULSAR_QT_ROOT` указывает на конкретное дерево Qt.

## Протокол

Хост и рантайм обмениваются фреймами по stdio: JSON-RPC в control-канале и
бинарный data-канал для крупных payload'ов. Рантайм объявляет себя
handshake-сообщением `__hello` (версия протокола, рантайм, capabilities) и
работает через абстракцию `Transport`. См. [`protocol.md`](protocol.md).

## Структура репозитория

```
cli/        CLI (create/install/update/doctor), шаблоны проектов, сборка Android
core/       рантайм + SDK
  caps/     встроенные capabilities (fs, net, paths, shell, storage)
  runtime/  рантайм Bun, который общается с хостом
  sdk/      пакет `pulsar`, который импортируют приложения
host/       хост на C++/Qt: QML-движок, диалоги, трей, управление окнами
  qml/      QML-модуль Pulsar и view для UI, собранного из JS
bridge/     супервизор на C++ (запускает Bun, сообщает о падениях, проксирует stdio)
launcher/   лончер на C++ без Qt для однофайловых приложений
examples/   примеры приложений
tests/      фикстуры для smoke-теста
scripts/    хелперы сборки, smoke, форматирования, релиза и упаковки Qt для Android
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
