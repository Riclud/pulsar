# Создание приложения

Это руководство — маршрут, а не справочник. Оно начинается с пустого проекта и
шаг за шагом собирает небольшое приложение для задач, экран за экраном. Каждый
раздел отвечает на один и тот же вопрос: **какой строительный блок мне сейчас
нужен?**

Если вам нужна только команда, смотрите [Быстрый старт](../quick-start/). Если
вы уже знаете, что хотите построить, и вам нужно имя опции, используйте
[Строительные блоки UI](../ui/) и [Обзор API](api/).

## Модель в голове

Приложение Pulsar состоит из трёх слоёв:

```
pulsar.json        manifest: id, entry point, windows, permissions
main.ts            your TypeScript: data, UI tree, event handlers, OS calls
host               Qt process: renders the tree and owns native windows
```

`main.ts` не генерирует HTML. Он возвращает **дерево компонентов**, и хост
обновляет это дерево на месте. Компонент — это обычная функция, например
`Column(...)` или `Button(...)`, поэтому UI — это обычный TypeScript, который
всего лишь описывает раскладку.

Самый важный объект — `app.store`:

- это JSON-безопасная карта ключ/значение;
- каждый ключ отслеживается: рендер, прочитавший его, запускается заново при его
  изменении, а остальные нет;
- значения публикуются также в QML;
- хост по возможности сохраняет фокус, прокрутку и состояние ввода.

Для состояния, которое читает только ваш TypeScript, легче подходят
[сигналы](components/). Впервые с нативным интерфейсом? Начните со страницы
[Если вы пришли из веба](web/).

Правило большого пальца: **данные живут в store; UI — это функция от store.**
Локальные переменные подходят для значений, создаваемых внутри render.

## Начните с шаблона

```sh
pulsar create my-app
cd my-app
pulsar dev
```

Сгенерированный проект небольшой:

```
my-app/
  pulsar.json     app id, window defaults, entry point
  main.ts         UI and state
  assets/icon.png
  package.json
  tsconfig.json
```

`pulsar.json` задаёт первое окно. `main.ts` выполняется через Bun на desktop и
через QuickJS на Android, поэтому сохраняйте переносимость приложения, если
ориентируетесь на Android (`"targets": ["android"]`, `"compat": "portable"` в
манифесте).

## Минимальный экран

```ts
import { App, Button, Column, Header, Text } from "pulsar"

const app = new App()

app.store.set("count", 0)

app.window("main").render(() =>
  Column(
    { fill: true, padding: 24, gap: 16 },
    Header({ title: "Hello" }),
    Text({ size: 20, text: `Count: ${app.store.get("count")}` }),
    Button(
      {
        onClick: () => app.store.set("count", (app.store.get("count") as number) + 1),
      },
      "+1",
    ),
  ),
)

app.run()
```

Что происходит при нажатии кнопки:

1. `onClick` записывает новое число в store.
2. Рендер прочитал этот ключ, поэтому он помечается для повторного запуска.
3. `render` запускается и создаёт новое дерево для этой части экрана.
4. Хост патчит существующий `Text`, а не пересоздаёт окно.

Значение просто читается при рендере. Функция в свойстве `on*` — обработчик события.

## Выберите правильный строительный блок

| Что нужно пользователю          | С чего начать                                     |
| ------------------------------- | ------------------------------------------------- |
| Страница                        | `Column({ fill: true, padding })` внутри `Scroll` |
| Секция внутри страницы          | `Card` или `Box`                                  |
| Панель заголовка с действиями   | `Header` или `Toolbar`       |
| Строки и колонки контента       | `Row`, `Column`, `Spacer`                         |
| Небольшой фиксированный список  | `For`                                             |
| Длинный или динамический список | `VirtualList`                                     |
| Сетка плиток                    | `Grid({ columns: "auto" })`                       |
| Текстовое поле                  | `Input` или `SearchField`                         |
| Многострочное поле              | `TextArea`                                        |
| Булев выбор                     | `Checkbox` или `Switch`                           |
| Один из нескольких вариантов    | `RadioGroup`, `Select`, `Segmented`               |
| Диапазон чисел                  | `Slider`, `RangeSlider`                           |
| Диалог                          | `Sheet`, на телефонах с `placement: "bottom"`    |
| Меню или плавающая панель       | `Menu`, `Popover`                                 |
| Основная навигация              | `NavBar` (телефон), `NavigationRail` (desktop)    |
| Вкладки внутри экрана           | `Tabs`, `Segmented`, `Pager`                      |
| Загрузка                        | `Spinner`, `Skeleton`, `Progress`                 |
| Пустое состояние                | `EmptyState`                                      |
| Временное подтверждение         | `Snackbar`                                        |
| Значок или аватар               | `Badge`, `Avatar`                                 |

Чтобы сохранить экран между показами и открывать его сразу, с той же позицией скролла,
оберните его в [`KeepAlive`](components/#sokhranit-ekran).

Подробные пропы для каждого блока — в разделе
[Строительные блоки UI](../ui/).

## Раскладка, которая не мешает

`Column` и `Row` — два контейнера, которые вы будете использовать чаще всего.
Оба принимают `gap`, `padding`, `fill`, `fillWidth`, `fillHeight` и `align`.

```ts
Column(
  { fill: true, padding: 16, gap: 12 },
  Header({ title: "Settings" }),
  Card({ padding: 16 }, Text("Account")),
  Spacer({ fillHeight: true }),
  Text({ size: 12, text: "Version 1.0.0" }),
)
```

- `fill: true` заставляет страницу занять окно.
- `padding` — внешний отступ. Он применяется к первому и последнему видимому
  дочернему элементу, чтобы контент не прилипал к краю карточки или окна.
- `Spacer` раздвигает элементы; `fillWidth`/`fillHeight` задают ось.
- Контент, который может превысить высоту окна, помещайте в `Scroll`, а не
  уменьшайте каждый размер текста.
- У окна нет своего отступа, а свободное место остаётся в конце, как во flexbox.

Для широких окон центрируйте контент, а не растягивайте его:

```ts
Container({ maxWidth: 840, padding: 24 }, Column({ gap: 16 } /* page content */))
```

Для адаптивной навигации:

```ts
const bp = createBreakpoints(app)

// inside render
bp.atLeast("medium")
  ? Row({ fill: true }, NavigationRail({ items, index, onChange }), content)
  : Column({ fill: true }, content, NavBar({ items, value, onChange }))
```

Текущая контрольная точка также публикуется как `Store.breakpoint`. Размеры
окна приходят как событие `window-resize`, включая поворот Android и разделённый
экран.

## Состояние, события и производные значения

Store принимает только JSON-значения: объекты, массивы, строки, конечные числа,
булевы значения и `null`. Экземпляры классов, функции, `undefined` и циклические
объекты отклоняются с ошибкой.

```ts
app.store.set("filter", "open")
app.store.get("filter") // unknown; cast or narrow it
app.store.has("filter")
app.store.delete("filter")
```

`set` с тем же значением ничего не делает. Значения сравниваются по ссылке, поэтому
изменение массива на месте не уведомляет UI:

```ts
const tasks = app.store.get("tasks") as Task[]

// no re-render: the same array
tasks.push(newTask)

// re-render: a new array
app.store.set("tasks", [...tasks, newTask])
```

Храните производные значения как функции, а не как дополнительные ключи store:

```ts
const tasks = (): Task[] => app.store.get("tasks") as Task[]
const openTasks = (): Task[] => tasks().filter((task) => !task.done)
```

Для асинхронной работы записывайте флаг ожидания и обрабатывайте ошибки в
обработчике события:

```ts
const load = async () => {
  app.store.set("loading", true)

  try {
    const notes = await storage.get("notes")
    app.store.set("notes", Array.isArray(notes) ? notes : [])
  } catch (error) {
    app.store.set("error", String(error))
  } finally {
    app.store.set("loading", false)
  }
}
```

Никогда не оставляйте промис без обработки: отклонённый обработчик события
показывается в dev-оверлее, но не исправляет состояние экрана за вас.

## Реалистичный список

В приложении для задач используется массив в store и один компонент строки:

```ts
import { App, Button, Checkbox, Column, EmptyState, For, Header, IconButton, Input, Row, Spacer } from "pulsar"

interface Task {
  id: string
  text: string
  done: boolean
}

const app = new App()

app.store.set("tasks", [] as Task[])
app.store.set("draft", "")

const tasks = (): Task[] => app.store.get("tasks") as Task[]
const save = (next: Task[]): void => app.store.set("tasks", next)

const add = (): void => {
  const text = String(app.store.get("draft")).trim()
  if (!text) return

  save([...tasks(), { id: String(Date.now()), text, done: false }])
  app.store.set("draft", "")
}

app.window("main").render(() =>
  Column(
    { fill: true, padding: 16, gap: 12 },
    Header({
      title: "Tasks",
      subtitle: `${tasks().filter((task) => !task.done).length} left`,
    }),
    Row(
      { gap: 8, fillWidth: true },
      Input({
        placeholder: "New task",
        value: String(app.store.get("draft")),
        onInput: (value) => app.store.set("draft", value),
        onSubmitted: add,
        expand: true,
      }),
      Button({ icon: "add", onClick: add }, "Add"),
    ),
    EmptyState({
      visible: tasks().length === 0,
      icon: "checklist",
      title: "No tasks yet",
      text: "Add the first one above.",
    }),
    For({
      each: tasks(),
      keyOf: (task) => task.id,
      spacing: 8,
      render: (task) =>
        Row(
          { gap: 8, fillWidth: true },
          Checkbox({
            label: task.text,
            checked: task.done,
            onToggle: (done) => save(tasks().map((item) => (item.id === task.id ? { ...item, done } : item))),
          }),
          Spacer({ fillWidth: true }),
          IconButton({
            icon: "delete",
            onClick: () => save(tasks().filter((item) => item.id !== task.id)),
          }),
        ),
    }),
  ),
)

app.run()
```

Почему это работает:

- `keyOf` сохраняет строки стабильными при перемещении элементов;
- каждое изменение создаёт новый массив и новый объект элемента;
- `onToggle` получает новое булево значение;
- поле ввода пишет в store, поэтому повторный render не теряет черновик.

Для тысяч строк замените `For` на `VirtualList`. Его элементы — простые записи
`{ title, subtitle, icon, trailing, section }`; используйте `onPress`,
`onSelect`, `onAction` и опции списка для выбора, свайп-действий, обновления и
изменения порядка.

## Экраны и навигация

`createRouter(app)` хранит стек и публикует текущий маршрут в store под ключом
`route`:

```ts
import { createRouter } from "pulsar"

const router = createRouter(app)

router.push("settings", { tab: "account" })

app.window("main").render(() =>
  router.view({
    home: () => HomeScreen(),
    settings: (params) => SettingsScreen({ tab: String(params.tab) }),
  }),
)
```

Системная кнопка «назад» снимает верхний элемент стека; при пустом стеке она
закрывает приложение. Передайте `handleBack: false`, чтобы обрабатывать «назад»
самостоятельно. `router.push`, `replace`, `pop`, `reset`, `current`, `entries`,
`canGoBack` и `depth` покрывают большинство приложений.

Для навигации вроде вкладок внутри одного экрана используйте `Tabs` для полосы
заголовков, `Segmented` для компактного переключателя и `Pager` для страниц со
свайпом.

## Данные и операционная система

Весь нативный доступ импортируется из `pulsar` и работает одинаково на desktop
и Android там, где платформа это поддерживает.

```ts
import { dialog, fs, net, notify, paths, storage } from "pulsar"

const file = await dialog.openFile({ title: "Open" })
if (file) {
  const text = await fs.readFile(file)
  app.store.set("document", text)
}

await fs.writeFile(`${(await paths.get()).data}/notes.txt`, "hello")

const response = await net.fetch("https://api.example.com/items")
const items = JSON.parse(response.text)

await storage.set("lastSync", Date.now())
await notify.show({ title: "Synced", body: `${items.length} items` })
```

Что использовать:

| Задача                               | Модуль               |
| ------------------------------------ | -------------------- |
| Чтение/запись локальных файлов       | `fs`                 |
| Каталоги данных, конфигурации, кеша  | `paths`              |
| JSON-настройки                       | `storage`            |
| Токены и пароли                      | `secureStorage`      |
| HTTP, стриминг, WebSocket            | `net`                |
| Нативные средства выбора и сообщения | `dialog`             |
| Буфер обмена, меню «Поделиться»      | `clipboard`, `share` |
| Ориентация экрана, блокировка сна    | `device`             |
| Системные разрешения                 | `permissions`        |
| Уведомления                          | `notify`             |
| Воспроизведение аудио/видео          | `media`              |

Работа с сетью и файловой системой выполняется в нативном хосте на Android, а
не в UI-потоке, поэтому медленный запрос не замораживает дерево.

## Сборка и публикация

```sh
pulsar build                  # dist/<name>, one executable
pulsar build --target android # dist/<name>.apk
```

Сборки для desktop включают runtime Bun и, если не передан `--slim`, Qt.
Сборки для Android используют QuickJS и компилируют приложение в APK; первая
сборка один раз скачивает инструментарий Android.

Перед публикацией:

- задайте `id`, `name`, `version` и `icons` в `pulsar.json`;
- объявляйте только те разрешения, которые нужны приложению;
- добавьте `osPermissions` для камеры, микрофона, геолокации, уведомлений или
  хранилища на Android;
- проверьте раскладку в узком окне и при масштабе 200%;
- обработайте состояния загрузки, пустоты и ошибки, а не только успешный путь;
- держите `main.ts` свободным от импортов `node:` и `bun:`, если приложение
  ориентировано на Android.

## Частые ошибки

- **Использование локальных переменных как состояния.** Экран их не видит;
  используйте [сигнал, `createState` или store](components/).
- **Чтение обычных переменных модуля в рендере.** Они не отслеживаются, и экран не
  обновится. Используйте `createState`.
- **Изменение массивов или объектов на месте.** Значения сравниваются по ссылке;
  создавайте новое значение.
- **Забытый `key` у повторяющихся компонентов.** Строки могут поменяться
  состоянием.
- **Забытый `keyOf` в `For`.** Строки могут переиспользоваться с неверным
  состоянием.
- **Использование `For` для огромного списка.** Используйте `VirtualList`.
- **Все ветки в `visible`.** Используйте обычный тернарный оператор для
  взаимоисключающих экранов.
- **Блокировка UI длинным синхронным циклом.** Ожидайте нативные capability или
  разделяйте работу.
- **Хранение экземпляров классов.** Сначала сериализуйте в обычный JSON.
- **Ожидание QML.** Шаблон по умолчанию — TypeScript; QML — это запасной путь.

## Далее

- [Строительные блоки UI](../ui/) — каждый компонент, проп и паттерн.
- [Обзор API](api/) — окна, store, файлы, сеть и устройства.
- [Манифест](../manifest/) — каждое поле `pulsar.json`.
- [CLI](../cli/) — create, run, build и inspect.
