# Если вы пришли из веба

Вы знаете `div`, flexbox и React или что-то похожее. Эта страница объясняет
Pulsar в этих терминах: что такое каждый строительный блок, как думать о раскладке
и как шаг за шагом собрать настоящий экран.

## Что здесь иначе

В Pulsar нет HTML, DOM и CSS. Вы вызываете функции TypeScript, которые описывают
дерево, а нативный рендерер на Qt его рисует.

| В вебе                  | В Pulsar                                                    |
| ----------------------- | ----------------------------------------------------------- |
| HTML-элементы           | Функции: `Box(...)`, `Text(...)`                            |
| `class` и правила CSS   | Свойства у каждого узла и обычные JS-объекты для их повтора |
| Браузер рисует DOM      | Qt рисует нативно, Chromium нет                             |
| `useState`              | `signal()` или `app.store` для общих данных                 |
| Компонент React         | `component()`                                               |
| `fetch`, `localStorage` | `net.fetch`, `storage`                                      |

Любой вызов выглядит одинаково: сначала свойства, затем дети.

```ts
Box({ padding: 16, color: "#222" }, Text({ text: "Привет" }))
```

```html
<div style="padding: 16px; background: #222"><span>Привет</span></div>
```

Размеры — это обычные числа в логических пикселях. Единиц измерения, `rem` и
процентов нет.

## Строительные блоки

### Box — это ваш div

`Box` — простой контейнер: у него есть фон, скругление, рамка и отступы. Берите
его там, где написали бы стилизованный `div`.

```ts
Box({ color: "#222", radius: 12, padding: 16, borderWidth: 1, borderColor: "#444" }, Text({ text: "Панель" }))
```

Его дети идут вертикально. Чтобы выстроить их в линию, положите внутрь `Row` или
используйте `Row` сразу: он принимает те же свойства фона.

### Row и Column — это flexbox

`Row` — это `display: flex`. `Column` — это `display: flex; flex-direction: column`.
Их вы будете использовать чаще всего.

```ts
Row(
  { gap: 12, alignItems: "center", justify: "between", fillWidth: true },
  Text({ text: "Заголовок" }),
  Button({ label: "Сохранить" }),
)
```

```css
display: flex;
gap: 12px;
align-items: center;
justify-content: space-between;
width: 100%;
```

`Row`, `Column`, `Wrap` и `Stack` принимают также все свойства оформления `Box`,
так что `Row({ color: "#222", radius: 12 })` работает как стилизованный flex-`div`.

### Stack — это position: relative

`Stack` кладёт детей друг на друга. Только в нём работает `absolute`: значок на
аватаре или кнопка поверх картинки.

```ts
Stack(
  { width: 48, height: 48 },
  Image({ src: "avatar.png", width: 48, height: 48 }),
  Box({
    absolute: { top: 0, right: 0 },
    width: 12,
    height: 12,
    radius: 6,
    color: "#2ecc71",
  }),
)
```

### Text — единственный способ показать текст

Просто положить строку в `Box` нельзя. Текст всегда идёт через `Text`, и каждый
`Text` оформляется сам: наследования от родителя и каскада нет.

```ts
Text({ text: "Заголовок", size: 20, weight: "semibold", color: "#fff" })
Text({ size: 14 }, "Текст может быть и дочерним элементом")
```

Длинный текст не переносится, пока вы об этом не попросите:

```ts
Text({ text: longText, wrap: true, fillWidth: true })
Text({ text: longText, maxLines: 2, elide: "right", fillWidth: true })
```

### Элементы управления уже готовы

Не нужно стилизовать `button` или `input` с нуля. У них уже есть состояния
наведения, фокуса и нажатия, и они следуют теме.

| HTML                    | Pulsar                          |
| ----------------------- | ------------------------------- |
| `<button>`              | `Button`, `IconButton`          |
| `<input>`               | `Input`                         |
| `<textarea>`            | `TextArea`                      |
| `<input type=search>`   | `SearchField`                   |
| `<input type=checkbox>` | `Checkbox`, `Switch`            |
| `<select>`              | `Select`, `Segmented`           |
| `<input type=range>`    | `Slider`                        |
| `<img>`                 | `Image`, `Avatar`               |
| `<dialog>`              | `Sheet`                         |

События называются как в вебе: `onClick`, `onInput`, `onChange`. Они получают само
значение, а не объект события.

```ts
Input({ value: name.get(), onInput: (value) => name.set(value) })
```

### Page и Scroll

Окно само не прокручивается. Контенту выше окна нужен `Scroll` или `Page` — экран
с прокручиваемым телом и необязательными неподвижными шапкой и подвалом.

```ts
Page({ padding: 16, gap: 12, header: Text({ text: "Задачи", size: 24 }) }, Text({ text: "Эта часть прокручивается" }))
```

Скролл на всех платформах идёт по кривой инерции Android, нажатие останавливает его
без случайного клика, а у нижнего края контент растягивается. `overscroll: false` отключает
растяжение, а `flick: false` останавливает список сразу, как только палец поднят.

## Раскладка с точки зрения CSS

Большинство привычек из flexbox работает.

| CSS                              | Pulsar                                  |
| -------------------------------- | --------------------------------------- |
| `gap: 12px`                      | `gap: 12`                               |
| `padding: 8px 16px`              | `paddingY: 8, paddingX: 16`             |
| `padding-left: 8px`              | `paddingLeft: 8`                        |
| `justify-content: space-between` | `justify: "between"`                    |
| `align-items: center`            | `alignItems: "center"`                  |
| `flex: 1`                        | `flex: 1`                               |
| `width: 100%`                    | `fillWidth: true`                       |
| `height: 100%`                   | `fillHeight: true`                      |
| `min-height: 48px`               | `minHeight: 48`                         |
| `max-width: 600px`               | `maxWidth: 600`                         |
| `overflow: hidden`               | `clip: true`                            |
| `position: absolute; top: 8px`   | `absolute: { top: 8 }` внутри `Stack`   |
| `z-index: 2`                     | `zIndex: 2`                             |
| `opacity: 0.5`                   | `opacity: 0.5`                          |
| `border-radius: 12px`            | `radius: 12`                            |
| `box-shadow`                     | `elevation: 2`, `shadowColor`           |
| `display: none`                  | `visible: false` или тернарный оператор |
| `display: grid`                  | `Grid({ columns: 3 })`                  |
| `flex-wrap: wrap`                | `Wrap`                                  |
| `@media (min-width: ...)`        | `createBreakpoints(app)`                |

### Дети начинаются с начала

Как во flexbox, `Row`, `Column` или `Box` со свободным местом держит детей вместе в
начале. У окна нет своего отступа, поэтому задайте `padding` корневому узлу. В `Box`
нет своего центрирования: чтобы что-то отцентрировать, используйте `Column`.

```ts
Column({ width: 44, height: 44, color: "#222", justify: "center", alignItems: "center" }, Icon({ name: "add" }))
```

### Margin нет

Расстояние между соседями задаёт `gap` родителя. Для разового отступа используйте
`padding` на обёртке `Box` или `Spacer`.

```ts
Column({ gap: 12 }, First(), Second())
Row({}, Text({ text: "Слева" }), Spacer({ fillWidth: true }), Text({ text: "Справа" }))
```

### Как повторять стили

Классов нет. Стиль — это объект, а повторяемая часть — функция:

```ts
const panel = { color: "#222", radius: 12, padding: 16 }

Box(panel, Text({ text: "Один" }))
Box({ ...panel, color: "#333" }, Text({ text: "Два" }))
```

### Какой ширины мой Row?

Это главный сюрприз для веб-разработчика. `div` заполняет родителя, а `Row` и
`Column` **шириной с контент**, если не сказать иначе:

- `fillWidth: true` занимает доступную ширину;
- `Card`, `Scroll` и `Input` заполняют ширину по умолчанию.

`justify`, отличный от `start`, сам заполняет ширину, иначе ему нечего делать.
Задайте `width` или `fillWidth: false`, если нужен узкий `Row`. Если центрирование
ребёнка ни на что не влияет, `Row` или его родитель, скорее всего, уже, чем вам
кажется: добавьте `fillWidth`.

## Собираем экран шаг за шагом

Соберём карточку контакта так, как собирали бы её в вебе.

**1. Внешняя панель.** `Row` с фоном — это стилизованный flex-`div`.

```ts
Row(
  { color: "#222", radius: 12, padding: 12, gap: 12, alignItems: "center", fillWidth: true },
  // сюда пойдут дети
)
```

**2. Аватар.** Круглый `Box` фиксированного размера.

```ts
Box({ width: 48, height: 48, radius: 24, color: "#8b9dff" })
```

**3. Колонка текста.** `flex: 1` занимает всю оставшуюся ширину, как в вебе.

```ts
Column(
  { flex: 1, gap: 2 },
  Text({ text: "Анна", color: "#fff", weight: "semibold" }),
  Text({ text: "В сети", size: 12, color: "#aaa", maxLines: 1, elide: "right", fillWidth: true }),
)
```

**4. Действие.** Элементы управления готовы к использованию.

```ts
Button({ label: "Открыть", onClick: open })
```

**5. Сделаем компонент**, чтобы принимать свойства и использовать его повторно:

```ts
const Contact = component<{ key: string; name: string; status: string }>((props) => {
  return Row(
    { color: "#222", radius: 12, padding: 12, gap: 12, alignItems: "center", fillWidth: true },
    Box({ width: 48, height: 48, radius: 24, color: "#8b9dff" }),
    Column(
      { flex: 1, gap: 2 },
      Text({ text: props.name, color: "#fff", weight: "semibold" }),
      Text({ text: props.status, size: 12, color: "#aaa" }),
    ),
    Button({ label: "Открыть" }),
  )
})
```

**6. Выведем список.** Разверните строки в `Column` и укажите `key` у каждой, как
`key` в React:

```ts
Column(
  { gap: 8, fillWidth: true },
  ...people.map((person) => {
    return Contact({ key: person.id, name: person.name, status: person.status })
  }),
)
```

## JSX

Если вам удобнее теги, пишите экран в файле `.tsx`. Новые проекты уже настроены для
этого. В существующем нужны две строки в `compilerOptions`:

```json
"jsx": "react-jsx",
"jsxImportSource": "pulsar"
```

JSX компилируется в те же вызовы функций, поэтому учить новое не нужно:

```tsx
const Contact = component<{ key: string; name: string }>((props) => {
  return (
    <Row color="surface" radius={12} padding={12} gap={12} alignItems="center" fillWidth>
      <Avatar name={props.name} />
      <Text flex={1} weight="semibold">
        {props.name}
      </Text>
      <Button onClick={open}>Открыть</Button>
    </Row>
  )
})
```

Используйте `.tsx` для экранов с большой разметкой, а `.ts` для логики и состояния.
Они свободно импортируют друг друга, потому что компонент в обоих случаях — одна и
та же функция:

```ts
// main.ts
import { TasksScreen } from "./TasksScreen.tsx"

app.window().render(() => TasksScreen({ title: "Задачи" }))
```

```tsx
// TasksScreen.tsx
import { TaskRow } from "./task-row.ts"

export const TasksScreen = component<{ title: string }>((props) => {
  return (
    <Column fill gap={8} padding={16}>
      <Text size={24}>{props.title}</Text>
      {state.tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </Column>
  )
})
```

Отличия от React:

- HTML-тегов нет. `<div>` — это ошибка; используйте `<Box>`.
- Свойства — это свойства Pulsar: `color` и `gap`, а не `className` и `style`.
- Текст идёт внутрь `<Text>`. Текст прямо в `<Column>` игнорируется с предупреждением.
- `{show && <Text>...</Text>}`, `items.map(...)` и `<>...</>` работают как обычно.
- Дети приходят аргументами после `props`, а не в `props.children`:
  `component((props, ...children) => ...)`.

## Состояние с точки зрения React

Ближе всего к `useState` здесь `signal`. Разница в том, что функция настройки
выполняется **один раз**, а заново запускается только та функция, которую она
возвращает:

```tsx
// React
const Counter = () => {
  const [count, setCount] = useState(0)

  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

```ts
// Pulsar
const Counter = component(() => {
  const count = signal(0)

  return () => {
    return Button({
      label: String(count.get()),
      onClick: () => count.set(count.peek() + 1),
    })
  }
})
```

Правил хуков и массивов зависимостей нет: всё, что рендер прочитал через `.get()`,
отслеживается само. Подробнее в разделе [Компоненты и сигналы](../components/).

## Что использовать вместо

| Вам нужно                | Используйте                                    |
| ------------------------ | ---------------------------------------------- |
| `:hover`                 | `hover: { color: "#333" }`                     |
| `:active`                | `pressed: { color: "#111", scale: 0.98 }`      |
| `:disabled`              | `enabled: false`, `disabled: { opacity: 0.5 }` |
| `transition`, keyframes  | `enter`, `exit`, `transition`                  |
| Свайп или перетаскивание | `drag: { axis: "x", onRelease }`               |
| Длинный список           | `VirtualList`                                  |
| `display: none` на вкладке | `KeepAlive`, см. [Сохранить экран](../components/#sokhranit-ekran) |
| `stopPropagation`        | Не нужен: нажатие доходит только до самого вложенного узла |
| `localStorage`           | `storage`                                      |
| Хранение токена          | `secureStorage`                                |
| CSS-переменные и темы    | `defineTheme` и цвета темы вроде `"surface"`   |
| Своё рисование           | `Qml({ source })` с компонентом на QML         |

Не у всего из CSS есть аналог. Нет каскада селекторов, размеров в процентах,
свойства `transform` и узла `canvas`. Также у ваших собственных контейнеров нет
состояния `:focus`.

## Что дальше

- [Соберите приложение](../) — полное приложение задач с нуля.
- [Компоненты и сигналы](../components/) — состояние, свойства и жизненный цикл.
- [UI-блоки](../../ui/) — все компоненты и свойства.
