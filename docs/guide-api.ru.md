# Обзор API

API импортируется из пакета `pulsar`. У него две точки входа: `App` для самого
приложения и набор модулей для нативных capability. Одни и те же модули работают
в `main.ts` и в обработчиках событий UI.

```ts
import { App, fs, net, storage } from "pulsar"
```

Полные списки опций — в [справочнике App API](../../app-api/). Эта страница
объясняет, как всё складывается вместе, и паттерны, которые предотвращают
ошибки.

## App

```ts
const app = new App()

app.store.set("ready", true)

app.on("window-close", () => console.log("closed"))
app.window("main").render(() => screen())
app.run()
```

| Член                                | Назначение                                           |
| ----------------------------------- | ---------------------------------------------------- |
| `new App(config?)`                  | Создать приложение; config берётся из `pulsar.json`. |
| `app.store`                         | Реактивный JSON-store, общий для всех окон.          |
| `app.window(label?)`                | Получить дескриптор окна (по умолчанию первое окно). |
| `app.createWindow(config)`          | Создать окно во время выполнения.                    |
| `app.closeWindow(label?)`           | Закрыть окно.                                        |
| `app.on(event, handler)`            | Подписаться на события хоста, UI и capability.       |
| `app.send(event, payload, target?)` | Отправить разовое событие в окно (`*` — всем).       |
| `app.windows`                       | Все открытые окна.                                   |
| `app.manifest`                      | Разобранный `pulsar.json`.                           |
| `app.quit()`                        | Завершить приложение.                                |
| `app.run()`                         | Маркер-пустышка; циклом событий владеет хост.        |

`app.window(label).render(() => ...)` запускает функцию при каждом изменении
store. `render` также может принимать статическое дерево.

## Store

Store — реактивная карта, безопасная для JSON. Каждый ключ публикуется в UI как
`Store.<key>`.

```ts
app.store.set("count", 0)
app.store.get("count") // unknown
app.store.has("count")
app.store.delete("count")
app.store.keys()
```

Правила:

- Принимаются только простые объекты, массивы, строки, конечные числа, булевы
  значения и `null`. Функции, экземпляры классов, `undefined`, `bigint`, `NaN` и
  `Infinity` вызывают исключение.
- Циклические ссылки отклоняются.
- `set` с глубоко равным значением ничего не делает. Опрос одних и тех же данных
  не вызывает повторный render.
- Изменение объекта или массива на месте и вызов `set` с той же ссылкой всё равно
  создаёт новый JSON-снимок, но сравнение со старым значением может удивить.
  Создавайте новые значения явно:

```ts
const next = tasks().map((task) => (task.id === id ? { ...task, done } : task))
app.store.set("tasks", next)
```

Производные значения — это функции, а не дополнительные ключи:

```ts
const tasks = (): Task[] => app.store.get("tasks") as Task[]
const remaining = (): number => tasks().filter((task) => !task.done).length
```

## Окна

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
await panel.destroy()
```

Каждый метод возвращает `Promise<boolean>`. Окна, объявленные в `pulsar.json`,
являются стартовыми; дополнительные можно создавать во время выполнения:

```ts
const settings = app.createWindow({
  label: "settings",
  ui: "ui/settings.qml",
  width: 420,
  height: 320,
})

await settings.show()
```

Если опустить `ui`, окно рендерится из TypeScript через `render`.

## События

События окон и приложения:

```ts
app.on("window-close", (params) => console.log(params.label))
app.on("window-state", (params) => console.log(params.label, params.state))
app.on("window-resize", (params) => console.log(params.width, params.height))
app.on("window-move", (params) => console.log(params.x, params.y))
app.on("window-focus", () => {})
app.on("window-blur", () => {})
app.on("window-all-closed", () => app.quit())
```

Жизненный цикл Android и кнопка «назад»:

```ts
app.on("app-pause", (params) => saveDraft(params.state))
app.on("app-resume", () => refresh())
app.on("app-stop", () => {})
app.on("back-pressed", () => closeDialog())
```

`app-pause` срабатывает со значением `"inactive"` для диалогов и панели
уведомлений и со значением `"suspended"`, когда приложение уходит в фон.
Сохраняйте долговечное состояние по `app-pause` или `app-stop`: Android может
убить фоновый процесс. Пока клавиатура открыта, первое нажатие «назад» только
скрывает её.

События desktop и системы:

```ts
app.on("open-file", (params) => openDocument(params.path))
app.on("open-url", (params) => routeDeepLink(params.url))
app.on("second-instance", (params) => app.window().focus())
app.on("menu", (params) => runMenuAction(params.id))
app.on("tray-menu", (params) => runTrayAction(params.event))
app.on("tray-activated", () => showWindow())
app.on("theme-changed", (params) => console.log(params.scheme))
app.on("power-suspend", () => saveNow())
app.on("power-resume", () => refresh())
app.on("power-source", (params) => console.log(params.onBattery))
app.on("notification-click", (params) => focusByToken(params.token))
app.on("notification-action", (params) => handleAction(params.token, params.id))
app.on("share", (params) => importShared(params))
app.on("log", (params) => console.log(params.level, params.message))
```

Из UI в бэкенд и из бэкенда в UI:

```ts
// backend -> UI
app.send("update-ready", { version: "1.2.0" })
app.window("main").emit("refresh")

// UI -> backend is the same app: call a function from an event handler
Button({ onClick: () => refresh() }, "Refresh")
```

Для окон QML подписывайтесь через синглтон `Pulsar` и фильтруйте по
`PulsarWindowLabel`.

## Capability и разрешения

Capability — это нативные функции, стоящие за модулями. Манифест определяет,
какие из них может использовать приложение:

```json
{
  "permissions": ["fs", "net", "dialog", "notify", "storage"]
}
```

Если `permissions` отсутствует, разрешено всё. Если присутствует — только
перечисленные capability.

| Разрешение    | Что покрывает                                               |
| ------------- | ----------------------------------------------------------- |
| `fs`          | чтение/запись файлов, stat, rename, trash, watch            |
| `net`         | `net.fetch`, `net.request`, `net.websocket`, `net.download` |
| `paths`       | каталоги data/config/cache приложения                       |
| `shell`       | открытие URL в приложении по умолчанию                      |
| `notify`      | нативные уведомления и каналы Android                       |
| `dialog`      | нативные диалоги открытия/сохранения/сообщения, toast       |
| `screen`      | список мониторов                                            |
| `theme`       | системная цветовая схема, переопределения темы              |
| `system`      | локаль, часовой пояс, состояние питания                     |
| `storage`     | JSON-файл хранилища                                         |
| `secure`      | связка ключей ОС / защищённое хранилище                     |
| `clipboard`   | чтение/запись буфера обмена                                 |
| `share`       | системное меню «Поделиться»                                 |
| `device`      | блокировка ориентации и режим бодрствования                 |
| `permissions` | запросы системных разрешений во время выполнения            |
| `media`       | проигрыватель медиа на стороне хоста                        |
| `tray`        | значок и меню в трее                                        |

Управление окнами — это ядро, и оно никогда не ограничивается. Пользовательские
capability, зарегистрированные приложением, также никогда не ограничиваются.

Разрешения ОС во время выполнения — отдельная история:

```json
{ "osPermissions": ["camera", "microphone", "location", "notifications", "storage"] }
```

```ts
if (await permissions.request("camera")) startScanner()
const allowed = await permissions.check("microphone")
```

На Android они попадают в манифест, а `request` показывает системный запрос. На
desktop оба вызова возвращают `true`.

## Файлы, пути и хранилище

```ts
import { fs, paths, secureStorage, storage } from "pulsar"

const text = await fs.readFile("notes.txt") // utf8
const bytes = await fs.readFile("cover.png", "base64")
await fs.writeFile("notes.txt", "hello")
await fs.appendFile("notes.txt", " world")

const entries = await fs.listDir(".")
const exists = await fs.exists("notes.txt")
const info = await fs.stat("notes.txt") // size, isFile, isDirectory, mtimeMs, createdAtMs

await fs.mkdir("data/sub", true)
await fs.rename("a.txt", "b.txt")
await fs.copy("b.txt", "copy.txt")
await fs.remove("copy.txt", true)
await fs.moveToTrash("b.txt")

const stop = fs.watch("notes.txt", (path) => console.log("changed", path))
stop()

const dirs = await paths.get() // data, config, cache, temp, home
```

Используйте `paths.get().data` для долговечных файлов приложения, `.config` —
для настроек, `.cache` — для временных данных и `.temp` — для рабочих файлов.

```ts
await storage.set("settings", { theme: "dark" })
const settings = await storage.get("settings")

await secureStorage.set("api-token", token)
const saved = await secureStorage.get("api-token")
```

`storage` — это JSON-файл в каталоге данных приложения. `secureStorage` хранит
строки в связке ключей ОС (Keychain, DPAPI или libsecret) и привязан к id
приложения. Используйте его для токенов и паролей, а не для больших данных.

`fs.open(path)` передаёт файл ОС. Видеофайлы открываются во встроенном
проигрывателе, когда доступен QtMultimedia. `fs.exportTo(path, name?)` копирует
файл в Downloads; на Android открывает диалог сохранения SAF.

## Сеть

```ts
import { net, NetError } from "pulsar"

try {
  const response = await net.fetch("https://api.example.com/items", {
    method: "GET",
    headers: { Accept: "application/json" },
    timeoutMs: 15000,
  })

  const items = JSON.parse(response.text)
} catch (error) {
  if (error instanceof NetError) {
    console.error(error.code, error.message)
  }
}
```

`net.fetch` выполняется в нативном хосте, а не в движке JS. Опции: `method`,
`headers`, `body` (строка или `Uint8Array`), `timeoutMs`, `redirect`
(`follow`/`manual`/`error`), `maxRedirects`, `responseType`
(`text`/`binary`/`auto`) и `tlsFingerprint`.

Стриминг:

```ts
const request = net.request("https://example.com/big.bin")

request.on("response", (info) => console.log(info.status))
request.on("data", (chunk) => {
  const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk
  total += bytes.byteLength
})
request.on("end", () => console.log("done", total))
request.on("error", (error) => console.error(error.code))

request.abort()
```

Скачивание на диск с прогрессом и возобновлением:

```ts
const file = await net.download("https://example.com/big.zip", "big.zip", {
  resume: true,
  onProgress: (received, total) => console.log(received, total),
})

console.log(file.path, file.bytes, file.resumed)
```

WebSocket:

```ts
const socket = net.websocket("wss://example.com/ws", { protocols: ["chat"] })

socket.on("open", (info) => console.log(info.protocol))
socket.on("message", (data) => console.log(data))
socket.on("close", (info) => console.log(info.code, info.reason))
socket.on("error", (error) => console.error(error.code))

socket.send("hello")
socket.send(new Uint8Array([1, 2, 3]))
socket.close(1000, "bye")
```

`net.websocket` требует модуль Qt WebSockets; текущий пакет Qt для Android его не
включает, поэтому вызовы там возвращают `ERR_UNSUPPORTED`.

## Диалоги, уведомления и трей

```ts
import { dialog, notify, tray } from "pulsar"

const file = await dialog.openFile({ title: "Open", filter: "Text (*.txt);;All files (*)" })
const many = await dialog.openFiles()
const dir = await dialog.openDirectory()
const saveTo = await dialog.saveFile()
await dialog.message({ title: "Pulsar", text: "Done" })
await dialog.toast("Saved")
```

```ts
const token = await notify.show({ title: "Build", body: "Finished" })

await notify.show({
  title: "Task due",
  body: "Buy milk",
  actions: [{ id: "snooze", title: "Snooze" }],
})

app.on("notification-click", (params) => focusByToken(params.token))
app.on("notification-action", (params) => runAction(params.token, params.id))

await notify.channel({ id: "reminders", name: "Reminders", importance: 3 })
```

Действия уведомлений используют демон freedesktop в Linux. На macOS и Windows
уведомление показывается без кнопок. На Android создайте канал один раз, а
события нажатия приходят как `notification-click`.

```ts
await tray.setIcon("assets/icon.png")
await tray.setTooltip("My App")
await tray.setMenu([{ label: "Show", event: "show" }, { separator: true }, { label: "Quit", event: "quit" }])
```

События трея приходят как `tray-menu` (`{ event }`) и `tray-activated`
(`{ reason }`).

## Устройства, медиа и система

```ts
import { clipboard, device, media, screen, share, system, theme } from "pulsar"

await clipboard.write("copied")
const text = await clipboard.read()

await share.text("Look at this")
await share.url("https://pulsarjs.org")
await share.file("photo.jpg", { mime: "image/jpeg" })

await device.setOrientation("landscape")
await device.setKeepAwake(true)

const screens = await screen.list()
const primary = await screen.primary()

const { locale, language, timezone } = await system.locale()
const power = await system.power()
const { scheme } = await theme.current()
```

Проигрыватель медиа:

```ts
media.load([
  { source: "first.mp3", title: "First", artist: "Demo" },
  { source: "second.mp3", title: "Second" },
])

media.play()
media.seek(42)
media.setVolume(0.8)
media.next()

const unsubscribe = media.on((snapshot) => {
  app.store.set("player", snapshot)
})
```

У снимка есть `state` (`idle`, `loading`, `playing`, `paused`, `stopped`,
`ended`, `error`), `position`, `duration`, `rate`, `volume`, `index`, `source`,
`title`, `artist` и `playing`. На Android проигрыватель запускает foreground
service с MediaSession и управлением с экрана блокировки.

## Меню и недавние документы

```ts
app.setMenu([
  {
    label: "File",
    items: [
      { id: "new", label: "New", shortcut: "CmdOrCtrl+N" },
      { separator: true },
      { id: "hide", label: "Hide done", checked: app.store.get("hideDone") === true },
    ],
  },
])

app.on("menu", (params) => runMenuAction(params.id))

app.addRecentDocument("/home/me/notes.md")
app.clearRecentDocuments()
```

Нативное меню пока поддерживается только на macOS; Linux и Windows игнорируют
`setMenu`. Недавние документы интегрируются со списками недавних документов ОС.

## Пользовательские capability

Зарегистрируйте capability, чтобы вызывать свой код через тот же механизм
разрешений и событий:

```ts
import { callCapability, registerCapability } from "pulsar"

registerCapability("notes.count", async () => notes().length)

const count = (await callCapability("notes.count")) as number
```

Пользовательские capability не ограничиваются манифестом. Используйте их, чтобы
дать окнам QML стабильную поверхность или изолировать платформозависимый код за
одной функцией.

## Асинхронность, ошибки и логирование

- Каждая capability возвращает promise; ожидайте его или добавляйте `.catch`.
- Оборачивайте IO в `try/catch` и кладите ошибку в store, когда UI должен её
  показать.
- `NetError` несёт стабильный `code`; ветвитесь по коду, а не по сообщению.
- Неперехваченная ошибка в dev-сервере показывает оверлей и сопоставляет кадры
  стека с исходниками TypeScript. В production обрабатывайте её сами.
- `console.log/info/debug/warn/error` пишет в stderr и пересылается в QML.
  Логи UI приходят как событие `log`.

```ts
app.store.set("saving", true)

try {
  await storage.set("draft", draft())
  app.store.set("error", "")
} catch (error) {
  app.store.set("error", error instanceof Error ? error.message : String(error))
} finally {
  app.store.set("saving", false)
}
```

## Замечания по Android

- «Назад» сначала скрывает клавиатуру, затем доходит до `back-pressed`; без
  обработчика приложение закрывается.
- Сохраняйте состояние по `app-pause` или `app-stop`; процесс может быть убит в
  фоне.
- `net`, `fs` и медиа выполняются в нативном хосте, а не в UI-потоке.
- `net.websocket` недоступен в текущем пакете Qt для Android.
- Используйте `permissions.request` для камеры, микрофона, геолокации,
  уведомлений и хранилища; объявляйте их в `osPermissions`.
- Средства выбора файлов возвращают копии в песочнице; используйте `fs.exportTo`,
  чтобы отправить файл наружу.
- Dev-сервер поддерживает `pulsar dev --android`, `pulsar ui`, `pulsar state`,
  `pulsar tap`, `pulsar type`, `pulsar expect`, `pulsar shot` и `pulsar eval`.

## Производительность и безопасность

- Предпочитайте `VirtualList` рендерингу тысяч строк.
- Добавляйте debounce для ввода в поиске и сетевых вызовов.
- Держите store небольшим; большие массивы сериализуются и сравниваются.
- Не опрашивайте чаще, чем нужно UI; no-op при глубоком равенстве помогают, но
  не делают опрос бесплатным.
- Храните секреты в `secureStorage`, никогда в `storage` или исходном коде.
- Запрашивайте минимум разрешений манифеста и разрешений ОС.
- Считайте файлы и URL, пришедшие от ОС, недоверенным вводом.
- Разрешайте пути внутри `paths.get()` вместо записи в произвольные места.

## Полный пример

Экран заметок, который загружает данные из хранилища, сохраняет черновик, ищет и
удаляет:

```ts
import {
  App,
  bind,
  Button,
  Card,
  Column,
  EmptyState,
  For,
  Header,
  IconButton,
  Input,
  Row,
  SearchField,
  Spacer,
  Text,
  storage,
} from "pulsar"

interface Note {
  id: string
  title: string
  body: string
}

const app = new App()

app.store.set("notes", [] as Note[])
app.store.set("query", "")
app.store.set("title", "")

const notes = (): Note[] => app.store.get("notes") as Note[]
const visible = (): Note[] => {
  const query = String(app.store.get("query")).toLowerCase()
  if (!query) return notes()

  return notes().filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(query))
}

const saveAll = async (next: Note[]): Promise<void> => {
  app.store.set("notes", next)
  await storage.set("notes", next)
}

const load = async (): Promise<void> => {
  const saved = await storage.get("notes")
  app.store.set("notes", Array.isArray(saved) ? (saved as Note[]) : [])
}

const add = async (): Promise<void> => {
  const title = String(app.store.get("title")).trim()
  if (!title) return

  await saveAll([{ id: String(Date.now()), title, body: "" }, ...notes()])
  app.store.set("title", "")
}

app.on("app-resume", () => void load())

app.window("main").render(() =>
  Column(
    { fill: true, padding: 16, gap: 12 },
    Header({ title: "Notes" }),
    SearchField({
      placeholder: "Search",
      value: bind(() => String(app.store.get("query"))),
      onInput: (query) => app.store.set("query", query),
    }),
    Row(
      { gap: 8, fillWidth: true },
      Input({
        placeholder: "Note title",
        value: bind(() => String(app.store.get("title"))),
        onInput: (title) => app.store.set("title", title),
        onSubmitted: () => void add(),
        expand: true,
      }),
      Button({ icon: "add", onClick: () => void add() }, "Add"),
    ),
    EmptyState({ visible: visible().length === 0, icon: "description", title: "No notes" }),
    For({
      each: visible(),
      keyOf: (note) => note.id,
      spacing: 8,
      render: (note) =>
        Card(
          { padding: 12 },
          Row(
            { gap: 8, fillWidth: true },
            Column(
              { gap: 2, expand: true },
              Text({ weight: "medium" }, note.title),
              Text({ size: 12, color: "gray" }, note.body),
            ),
            Spacer({ fillWidth: true }),
            IconButton({
              icon: "delete",
              a11yLabel: `Delete ${note.title}`,
              onClick: () => void saveAll(notes().filter((item) => item.id !== note.id)),
            }),
          ),
        ),
    }),
  ),
)

void load()
app.run()
```

## Указатель API

| Область          | С чего начать                                               |
| ---------------- | ----------------------------------------------------------- |
| App              | `new App`, `app.store`, `app.on`, `app.window`, `app.send`  |
| Окна             | `WindowHandle`, `createWindow`, `setFullscreen`             |
| Файлы            | `fs`, `paths`, `fs.watch`, `fs.open`, `fs.exportTo`         |
| Хранилище        | `storage`, `secureStorage`                                  |
| Сеть             | `net.fetch`, `net.request`, `net.websocket`, `net.download` |
| Диалоги          | `dialog.openFile`, `dialog.saveFile`, `dialog.message`      |
| Уведомления      | `notify.show`, `notify.channel`                             |
| Трей и меню      | `tray`, `app.setMenu`                                       |
| Устройства       | `clipboard`, `share`, `device`, `permissions`               |
| Медиа            | `media.load`, `media.play`, `media.on`                      |
| Система          | `screen`, `system.locale`, `system.power`, `theme`          |
| Пользовательское | `registerCapability`, `callCapability`                      |
