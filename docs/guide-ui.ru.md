# Строительные блоки UI

UI в Pulsar — это дерево вызовов функций. Эта страница — каталог: для чего нужен
каждый блок, какие пропы важны и какие паттерны сохраняют экран читаемым.
Начните с [Создания приложения](../guide/), если хотите пройти по шагам.

## Как работает вызов компонента

Каждый компонент — это функция. Первый аргумент — объект пропов, остальные —
дочерние элементы:

```ts
Button({ icon: "add", onClick: add }, "Add task")

Card({ padding: 16 }, Text({ size: 14 }, "A card with one child"))
```

Пропы — это обычные значения. Текст также можно передать как дочерний элемент:

```ts
Text({ size: 20, weight: "semibold" }, "Hello")
Text({ size: 20, text: "Hello" })
```

В файле `.tsx` те же вызовы можно писать тегами. Обе формы компилируются одинаково, а
файлы `.ts` и `.tsx` импортируют друг друга. Настройка описана в разделе
[JSX](../guide/web/#jsx).

```tsx
<Button icon="add" onClick={add}>Добавить задачу</Button>

<Card padding={16}>
  <Text size={14}>Карточка с одним ребёнком</Text>
</Card>
```

### Пропы, общие для каждого узла

| Проп                       | Значение                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| `width` / `height`         | Фиксированный размер в пикселях.                                      |
| `fill`                     | Занять доступное пространство.                                        |
| `fillWidth` / `fillHeight` | Занять доступную ширину или высоту внутри `Row`/`Column`.             |
| `align`                    | Горизонтальное размещение: `start`, `center`, `end`, `left`, `right`. |
| `maxWidth`                 | Ограничить ширину; с `align: "center"` остаётся по центру.            |
| `visible`                  | Скрыть, но оставить узел в дереве.                                    |
| `opacity`                  | От 0 до 1.                                                            |
| `animate`                  | Плавно менять opacity за указанное число миллисекунд.                 |
| `tooltip`                  | Текст подсказки при наведении.                                        |
| `a11yLabel`                | Имя, объявляемое программами чтения с экрана.                         |
| `a11yHint`                 | Дополнительная подсказка, объявляемая после имени.                    |
| `neon`                     | `true` или `NeonOptions` для свечения вокруг узла.                    |
| `key`                      | Стабильная идентичность внутри списка.                                |

### События

Пропы событий используют веб-имена и получают новое значение, где это имеет
смысл:

- `onClick()` на кнопках, значках и чипах;
- `onInput(value)` на текстовых полях и поиске;
- `onToggle(checked)` на чекбоксах и переключателях;
- `onChange(value)` на слайдерах, select, radio, вкладках и segmented-контролах;
- `onClose()` на оверлеях;
- `onPress(key)` и `onAction(key, actionID)` на `VirtualList`;
- `onLongPress()` на карточках, блоках, изображениях, кнопках и чипах.

```ts
Input({
  value: String(app.store.get("query")),
  onInput: (query) => app.store.set("query", query),
})
```

Значение просто читается при рендере, а функция в свойстве `on*` выполняется при событии.

### Свойства раскладки

Их принимает любой узел, в дополнение к таблице выше и свойствам `Row`, `Column`,
`Box` и `Card`:

| Свойство                                   | Значение                                                            |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `paddingX`, `paddingY`                     | Отступы по горизонтали и вертикали у контейнеров, `Box` и `Card`.   |
| `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | Одна сторона; важнее `paddingX`, `paddingY` и `padding`. |
| `justify`                                  | `Row`/`Column`: `start`, `center`, `end`, `between`, `around`, `evenly`. |
| `alignItems`                               | `Row`/`Column`: `start`, `center`, `end`, `stretch` по поперечной оси. |
| `flex`                                     | Доля свободного места в родительском `Row` или `Column`.            |
| `minWidth`, `minHeight`, `maxHeight`       | Ограничения размера внутри контейнера.                              |
| `clip`                                     | Обрезать содержимое за границами узла.                              |
| `zIndex`                                   | Порядок наложения среди соседей.                                    |
| `absolute`                                 | Смещения `{ top, right, bottom, left }`. Только внутри `Stack`.     |

`Row`, `Column`, `Wrap` и `Stack` принимают также свойства оформления `Box`:
`color`, `hoverColor`, `radius`, `borderWidth`, `borderColor`, `gradient`,
`elevation`, `shadowColor`, `onClick` и `onLongPress`.

```ts
Row(
  { color: "surface", radius: 12, paddingX: 16, paddingY: 8, justify: "between", alignItems: "center" },
  Text({ text: "Заголовок" }),
  Button({ label: "OK" }),
)
```

`Row` и `Column` шириной с контент, если у них нет `fillWidth`. Подробнее в разделе
[Если вы пришли из веба](../guide/web/).

### Свойства движения

Движение выполняется в рендерере, поэтому остаётся плавным, даже когда JavaScript
занят.

| Свойство     | Значение                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| `hover`      | `{ color, borderColor, opacity, scale }`, пока указатель над узлом.             |
| `pressed`    | То же, пока узел удерживают.                                                    |
| `disabled`   | То же, пока `enabled` равен false.                                              |
| `enabled`    | `false` отключает ввод у узла и всего, что внутри него.                         |
| `enter`      | `{ opacity, x, y, scale }`, откуда анимировать при появлении.                   |
| `exit`       | То же, куда анимировать перед удалением или скрытием.                           |
| `transition` | `{ duration, curve }`; `curve` — это `spring`, `ease` или `linear`.             |
| `drag`       | `{ axis, threshold, onRelease }`; следует за пальцем и пружинит обратно.        |

```ts
Card(
  {
    key: task.id,
    pressed: { scale: 0.98 },
    enter: { opacity: 0 },
    exit: { opacity: 0 },
    transition: { duration: 180 },
    drag: {
      axis: "x",
      onRelease: ({ direction }) => {
        if (direction === "right") complete(task)
      },
    },
  },
  Text({ text: task.text }),
)
```

`color` и `borderColor` работают у `Box`, `Card` и контейнеров с оформлением, а
`opacity` и `scale` — у любого узла. Состояния анимируются за `transition.duration`,
по умолчанию 120 мс. `hoverColor` — это сокращение для `hover: { color }`.

`enter` не срабатывает при первом рендере и для узла, созданного вместе с новым
родителем. `onRelease` вызывается только после порога `threshold`, по умолчанию
96 пикселей.

## Раскладка

### Column и Row

`Column` укладывает дочерние элементы вертикально, `Row` — горизонтально. Оба
принимают `gap`, `padding`, `fill`, `fillWidth`, `fillHeight` и `align`.

При свободном месте дети держатся вместе в начале, как во flexbox. `fillWidth` и
`fillHeight` всегда заполняют родителя. У окна нет своего отступа, поэтому задайте
`padding` корневому узлу.

```ts
Row(
  { gap: 8, fillWidth: true, padding: 12 },
  Icon({ name: "search" }),
  Text({ expand: true }, "Search results"),
  IconButton({ icon: "close", onClick: clear }),
)
```

- `padding` — внешний отступ для первого и последнего видимого дочернего
  элемента.
- `expand: true` на дочернем элементе позволяет ему занять оставшееся
  пространство.
- Используйте `Spacer({ fillWidth: true })` или `Spacer({ fillHeight: true })`,
  чтобы раздвинуть соседние элементы.
- Вложенность глубже двух уровней обычно означает, что стоит вынести
  [`component`](../guide/components/).

### Box и Card

Оба являются поверхностями. `Card` — обычный выбор для секции; `Box` — простой
прямоугольник.

```ts
Card(
  {
    padding: 16,
    radius: 10,
    elevation: 1,
    borderColor: "gray",
    borderWidth: 1,
    gradient: { from: "#1a1717", to: "#131010", direction: "vertical" },
  },
  Text({ weight: "medium" }, "Account"),
  Text({ size: 12, color: "gray" }, "Signed in as demo@example.com"),
)
```

| Проп                                | Эффект                                    |
| ----------------------------------- | ----------------------------------------- |
| `padding`, `radius`                 | Внутренний отступ и скругления.           |
| `color`                             | Цвет заливки.                             |
| `borderColor`, `borderWidth`        | Контур.                                   |
| `gradient: { from, to, direction }` | Линейная градиентная заливка.             |
| `elevation`, `shadowColor`          | Уровень тени и её оттенок.                |
| `onLongPress`                       | Взаимодействие в стиле контекстного меню. |

### Scroll, Container, Spacer, Divider

- `Scroll` делает страницу прокручиваемой, когда её контент выше окна. Он идёт по
  кривой инерции Android и растягивается у нижнего края; `overscroll: false` и `flick: false`
  отключают это.
- `Container({ maxWidth, padding })` центрирует и ограничивает контент на
  широких окнах.
- `Spacer` заполняет оставшееся пространство по главной оси.
- `Divider` — разделитель толщиной в один пиксель.

```ts
Scroll(
  { fill: true },
  Container({ maxWidth: 840, padding: 24 }, Column({ gap: 16 }, Header({ title: "Settings" }), settingsSections())),
)
```

### Shader

Шейдер рисует на видеокарте, поэтому анимация почти не тратит процессор, а настоящее свечение
обходится дёшево. В одном тесте экран с полноэкранным фоном, двумя волнами, молнией и пульсацией
занял 28% ядра телефона, а волна с молнией на `Canvas` занимали 81%. Есть три уровня, и для первых
двух математика не нужна.

**Готовые эффекты.** Только параметры.

```ts
Wave({ height: 40, fillWidth: true, color: "#c084fc", amplitude: 4, frequency: 6, speed: 3 })

Wave({ height: 40, fillWidth: true, color: "#5ce1e6", glowRadius: 8 })

Lightning({ height: 90, fillWidth: true, color: "#8b9dff", progress: 0.7, jitter: 26 })

Aurora({ fill: true, color: "#2b1055", accent: "#0f766e", speed: 0.08 })
```

**Свой эффект из готовых частей.** Положите файл `.frag` в приложение. Pulsar скомпилирует его при
`pulsar dev` и `pulsar build` и перекомпилирует при сохранении. Вы пишете одну функцию, которая
возвращает цвет для точки:

```glsl
// shaders/pulse.frag
uniform vec4 color;
uniform float rings;

vec4 effect(vec2 uv) {
    float radius = length(pixel - resolution / 2.0);
    float ring = wave(radius / resolution.y, rings, 4.0) * 0.5 + 0.5;

    return vec4(color.rgb, ring * glow(radius, resolution.y / 2.0));
}
```

```ts
Shader({ source: "shaders/pulse.frag", height: 180, fillWidth: true, uniforms: { color: "#ff6ac1", rings: 3 } })
```

Строки `uniform` становятся значениями, которые вы передаёте из TypeScript: число, строка с цветом
или массив из 2–4 чисел. Возвращайте обычный цвет, с прозрачностью Pulsar разберётся сам.

| Имя                          | Что даёт                                               |
| ---------------------------- | ------------------------------------------------------ |
| `uv`                         | Точка, от 0 до 1 по размеру узла.                      |
| `pixel`                      | Та же точка в пикселях.                                |
| `resolution`                 | Размер узла в пикселях.                                |
| `time`                       | Секунды с появления. Стоит при `animated: false`.      |
| `wave(x, frequency, speed)`  | Бегущая волна от -1 до 1. Без `sin` и числа пи.        |
| `noise(x)`, `noise(point)`   | Плавная случайность от 0 до 1.                         |
| `fbm(point)`                 | Случайность как облака, для дыма и течения.            |
| `zigzag(x, seed)`            | Острая случайность от -1 до 1, для молний.             |
| `segment(point, from, to)`   | Расстояние до отрезка.                                 |
| `line(distance)`             | Чёткий край по расстоянию.                             |
| `glow(distance, radius)`     | Мягкий свет, затухающий на `radius`.                   |
| `fade(distance, size)`       | Плавный переход от 0 до 1 на `size`.                   |

Большинство эффектов устроены по одному рецепту: найдите **расстояние** от точки до своей фигуры и
превратите его в свет через `line` и `glow`.

**Любой GLSL.** Внутри `effect` доступен весь язык. Об ошибке вы узнаете с номером строки в вашем
файле.

Что важно знать:

- Новый uniform нельзя добавить уже созданному узлу. Чтобы изменить набор, дайте узлу новый `key`.
- Шейдерам нужна видеокарта. При программном рендере, например на некоторых виртуальных машинах,
  узел будет пустым. Запасной вариант — `Canvas`.
- Файл `.frag.qsb` можно закоммитить или оставить сборке: именно он попадает в приложение.

`Canvas` подходит для структурированных рисунков, например графика с подписями, а шейдер — для
эффектов, которые двигаются постоянно.

### Orbit и Arrange

`Canvas` и `Shader` рисуют картинки. `Arrange` двигает **настоящие узлы** каждый кадр, поэтому
клики, наведение и текст у них остаются, а через мост ничего не идёт.

`Orbit` — готовый вариант. Он расставляет детей по кольцу и не требует математики:

```ts
Orbit(
  { fill: true, radiusX: 260, radiusY: 120, speed: 1, depth: 0.35, spin: spin.get(), transition: { duration: 850 } },
  ...hours.map((hour) => HourPill({ key: hour.time, hour })),
)
```

Глубина складывается из трёх вещей сразу: сплющенный эллипс, сильнее `scale` и ниже `opacity`
у дальней стороны и `z`, чтобы ближняя сторона перекрывала дальнюю. Если взять только что-то одно,
кольцо выглядит плоским.

В `Arrange` вы сами говорите, где стоит каждый ребёнок. Функция возвращает его центр и, по
желанию, `scale`, `rotation`, `opacity` и `z`:

```ts
Arrange(
  {
    fill: true,
    animated: true,
    params: { spin: spin.get() },
    transition: { duration: 850 },
    arrange: (index, count, { width, height, time, params }) => {
      const angle = (index / count) * 6.2831853 + params.spin - time * 0.1
      const shown = Math.abs(Math.cos(params.spin / 2))
      const near = (Math.sin(angle) + 1) / 2

      return {
        x: width / 2 + Math.cos(angle) * width * 0.42,
        y: height / 2 + Math.sin(angle) * width * 0.22,
        scale: (0.68 + 0.42 * near) * (0.8 + 0.2 * shown),
        opacity: (0.55 + 0.45 * near) * shown,
        z: near,
      }
    },
  },
  ...hours.map((hour) => HourPill({ key: hour.time, hour })),
)
```

Как и `Canvas`, `arrange` работает в рендерере и не видит внешние переменные. Данные передавайте
через `params`. Задайте `animated`, если раскладка всё время движется; иначе функция запускается
только при изменениях.

Числа в `params` **плавно переходят** к новому значению за `transition`, поэтому один `set`
запускает всю анимацию. В примере выше полный оборот `spin` заставляет кольцо резко провернуться,
погаснуть и появиться снова. Чтобы незаметно сменить данные, подмените их, пока кольцо погасло:

```ts
const pickDay = (next: number) => {
  spin.set(spin.peek() + 6.2831853)
  setTimeout(() => shownDay.set(next), 170)
}
```

### Canvas

`Canvas` рисует то, что не собрать из `Column`: волну в плеере, молнию, график. `ctx`
работает как 2D-контекст в браузере.

```ts
const Wave = () =>
  Canvas({
    height: 40,
    fillWidth: true,
    animated: true,
    params: { amplitude: 4, frequency: 6 },
    draw: (ctx, { width, height, time, params, colors }) => {
      ctx.strokeStyle = colors.primary
      ctx.lineWidth = 4
      ctx.lineCap = "round"
      ctx.beginPath()

      for (let x = 2; x <= width - 2; x += 1) {
        const phase = (params.frequency * 2 * Math.PI * x) / width - time * 2.5

        ctx.lineTo(x, height / 2 + params.amplitude * Math.sin(phase))
      }

      ctx.stroke()
    },
  })
```

В JSX то же самое:

```tsx
<Canvas height={40} fillWidth animated draw={(ctx, { width }) => ctx.fillRect(0, 0, width, 4)} />
```

`draw` выполняется в рендерере, а не в вашем JavaScript, поэтому кадр не идёт через мост.
Волна, нарисованная так, потратила втрое меньше процессора, чем та же волна, которую
считает JavaScript и отправляет каждый кадр. Из этого следует одно правило:

- **`draw` не видит внешние переменные.** Передавайте данные через `params`: при их
  изменении рисунок обновится. При чтении внешнего имени в логе будет понятная ошибка.
  Пишите `draw` стрелочной функцией.

`draw` получает `width`, `height`, `time` в секундах, `params` и `colors` темы. Без
`animated` рисунок обновляется только при смене `params`. Анимация останавливается, пока
`Canvas` скрыт.

**Берегите процессор.** Рисование идёт на CPU:

- Для свечения и постоянного движения лучше подойдёт [`Shader`](#shader).
- Избегайте `shadowBlur`. В одном тесте он утроил стоимость фигуры. Полупрозрачные слои
  линий выглядят как свечение и стоят намного меньше:

```ts
const Lightning = () =>
  Canvas({
    height: 80,
    fillWidth: true,
    animated: true,
    fps: 20,
    params: { color: "#8b9dff", progress: 0.7 },
    draw: (ctx, { width, height, time, params }) => {
      const seed = Math.floor(time * 14)
      const noise = (n: number) => {
        const value = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453

        return value - Math.floor(value)
      }
      const end = width * params.progress
      const strike = (color: string, lineWidth: number, alpha: number) => {
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.moveTo(0, height / 2)

        for (let x = 12, i = 0; x < end; x += 12, i++) {
          ctx.lineTo(x, height / 2 + (noise(i) - 0.5) * height * 0.7)
        }

        ctx.lineTo(end, height / 2)
        ctx.stroke()
      }

      ctx.lineJoin = "round"
      strike(params.color, 9, 0.15)
      strike(params.color, 4, 0.35)
      strike("#ffffff", 1.5, 1)
    },
  })
```

- Задавайте `fps`, если картинка меняется редко. По умолчанию анимация ограничена 60 кадрами
  даже на экранах 120 Гц, а `fps: 0` снимает ограничение.

### Grid

`Grid` размещает дочерние элементы по колонкам. Фиксированное число подходит для
дашбордов; `"auto"` выводит количество из ширины.

```ts
Grid(
  { columns: "auto", minColumnWidth: 180, gap: 12, padding: 16 },
  tiles.map((tile) => Card({ padding: 12 }, Text(tile.title))),
)
```

### Условия

Вызов компонента — обычный код, поэтому используйте тернарный оператор. `null` ничего
не рисует.

```ts
app.store.get("loading") === true
  ? Spinner({ size: 24 })
  : For({ each: items(), keyOf: (item) => item.id, render: row })
```

Чтобы сохранить целый экран между показами, используйте
[`KeepAlive`](../guide/components/#sokhranit-ekran).

`visible` — для скрытия одного узла, а не для переключения между целыми
экранами.

## Текст и контент

### Text

```ts
Text({
  text: "Release notes",
  size: 18,
  weight: "semibold",
  color: "black",
  align: "left",
  maxLines: 3,
  elide: "right",
  selectable: true,
})
```

- `size` — в пикселях; `weight` — `light`, `normal`, `medium`, `semibold`,
  `bold` или число.
- `markdown: true` рендерит Markdown вместо простого текста.
- `elide` обрезает переполнение слева (`left`), справа (`right`), посередине
  (`middle`) или при `true` (справа).
- `wrap: false` оставляет одну строку; `maxLines` ограничивает число
  перенесённых строк.
- `selectable` позволяет пользователю копировать текст.

### Image и Icon

```ts
Image({ src: "assets/cover.png", fillMode: "PreserveAspectCrop", height: 180 })
Icon({ name: "settings", size: 20, color: "gray", badge: "dot" })
```

Значки используют имена [Material Icons](https://fonts.google.com/icons), такие
как `add`, `delete`, `edit`, `check`, `arrow_back`, `close`, `search`,
`settings`.

### Avatar и Badge

```ts
Avatar({
  src: user.avatarURL,
  name: user.name,
  size: 40,
  status: "online",
  badge: 3,
})

Badge({ count: 12 })
Badge({ dot: true, color: "green" })
```

`Avatar` показывает инициалы, когда `src` отсутствует. `status` — `online`,
`away`, `busy` или `offline`. `badge` — это число или `"dot"`.

### Chip

```ts
Chip(
  {
    variant: "outline",
    selected: filters.includes("open"),
    onClick: () => toggleFilter("open"),
    onRemove: () => removeFilter("open"),
  },
  "Open",
)
```

`variant` — `solid`, `soft` или `outline`. Удаляемые чипы показывают действие
закрытия.

## Действия

### Button

```ts
Button(
  {
    variant: "solid",
    size: "md",
    icon: "save",
    iconPosition: "left",
    enabled: !saving,
    expand: true,
    onClick: save,
  },
  "Save",
)
```

Варианты: `solid`, `soft`, `outline`, `ghost`, `elevated`. Размеры: `sm`, `md`,
`lg`. `badge` добавляет число или точку; `onLongPress` добавляет вторичное
действие.

### IconButton и Fab

```ts
IconButton({ icon: "delete", color: "red", badge: "dot", onClick: remove })

Fab({
  icon: "add",
  placement: "bottom-end",
  onClick: createTask,
})
```

Размещение `Fab` — `bottom-end` (плавает поверх контента) или `inline` (остаётся
в раскладке).

## Ввод

### Input и TextArea

```ts
Input({
  variant: "outline",
  placeholder: "Email",
  keyboardType: "email",
  autoFocus: true,
  maxLength: 120,
  value: String(app.store.get("email")),
  onInput: (value) => app.store.set("email", value),
  onSubmitted: submit,
  onFocus: () => app.store.set("focused", true),
  onBlur: () => app.store.set("focused", false),
})

TextArea({
  placeholder: "Notes",
  lines: 5,
  onInput: (value) => app.store.set("notes", value),
})
```

`value` работает и когда поле в фокусе, поэтому, чтобы очистить поле после отправки,
достаточно записать в него пустую строку. Вводимый текст своим же отражением не
затирается. Поле с `onSubmitted` показывает клавишу «Готово» вместо «Далее».
`focusBorderColor` задаёт обводку в фокусе.

- `variant`: `filled` или `outline`.
- `password` маскирует значение.
- `keyboardType`: `text`, `email`, `number`, `decimal`, `phone`, `url`,
  `search`.
- `readOnly` оставляет значение доступным для выбора, но не для редактирования.
- `TextArea` — это `Input({ multiline: true })` с `lines` для высоты.

### SearchField

```ts
SearchField({
  placeholder: "Search tasks",
  debounce: 200,
  value: String(app.store.get("query")),
  onInput: (query) => app.store.set("query", query),
  onSubmit: search,
  onClear: () => app.store.set("query", ""),
})
```

`debounce` задерживает `onInput`; `onSubmit` срабатывает по Enter. Поле само
рисует значок поиска и кнопку очистки.

### Checkbox и Switch

```ts
Checkbox({
  label: "Remember me",
  checked: app.store.get("remember") === true,
  onToggle: (checked) => app.store.set("remember", checked),
})

Switch({ label: "Wi-Fi", checked: wifi, onToggle: (value) => setWiFi(value) })
```

Оба получают `onToggle(checked)`, а не `onChange`.

### RadioGroup

```ts
RadioGroup({
  options: [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ],
  value: String(app.store.get("scheme")),
  direction: "horizontal",
  onChange: (value) => app.store.set("scheme", value),
})
```

`options` принимает строки или `{ value, label }`. `Radio(label, options)` —
отдельный контрол.

### Slider и RangeSlider

```ts
Slider({
  min: 0,
  max: 100,
  value: Number(app.store.get("volume")),
  onChange: (value) => app.store.set("volume", value),
})

RangeSlider({
  min: 0,
  max: 100,
  from: 20,
  to: 60,
  step: 5,
  onChange: (from, to) => app.store.set("range", { from, to }),
})
```

Оба принимают `expand: true`, чтобы заполнить строку.

### Select и Segmented

```ts
Select({
  options: ["Low", "Normal", "High"],
  value: String(app.store.get("priority")),
  onChange: (value) => app.store.set("priority", value),
})

Segmented({
  items: ["All", "Open", "Done"],
  value: Number(app.store.get("tab")),
  onChange: (index) => app.store.set("tab", index),
})
```

`Select` открывает меню в нативном стиле; `Segmented` — встроенный компактный
выбор для двух-четырёх вариантов.

## Навигация

### Header и Toolbar

```ts
Header({
  title: "Inbox",
  subtitle: "12 unread",
  onBack: () => router.pop(),
  actions: [IconButton({ icon: "search", onClick: openSearch }), IconButton({ icon: "more_vert", onClick: openMenu })],
})

Toolbar(
  { padding: 8 },
  Text({ weight: "medium" }, "Filter"),
  Spacer({ fillWidth: true }),
  Button({ variant: "ghost", onClick: clear }, "Clear"),
)
```

`Header` — верхняя панель приложения; `Toolbar` — строка-поверхность для
контролов внутри экрана. `onBack` добавляет стрелку назад.

### Tabs и Pager

```ts
Tabs({
  items: ["Overview", "Activity", "Settings"],
  index: Number(app.store.get("tab")),
  onChange: (index) => app.store.set("tab", index),
})

Pager(
  { index: Number(app.store.get("page")), onPageChange: (page) => app.store.set("page", page) },
  overview(),
  activity(),
  settings(),
)
```

`Tabs` — полоса; `Pager` показывает один дочерний элемент за раз и поддерживает
свайпы при `interactive: true`.

### NavBar и NavigationRail

```ts
const items = [
  { label: "Home", icon: "home" },
  { label: "Search", icon: "search" },
  { label: "Profile", icon: "person" },
]

NavBar({
  items,
  value: Number(app.store.get("section")),
  onChange: (index) => app.store.set("section", index),
})

NavigationRail({
  items,
  index: Number(app.store.get("section")),
  expanded: true,
  padding: 8,
  onChange: (index) => app.store.set("section", index),
})
```

`NavBar` — для узких экранов, `NavigationRail` — для широких окон. Используйте
`createBreakpoints(app)`, чтобы выбрать один из них.

## Оверлеи

### Sheet

```ts
Sheet(
  {
    open: app.store.get("editing") === true,
    title: "New task",
    dismissible: true,
    duration: 140,
    onClose: () => app.store.set("editing", false),
  },
  Input({ placeholder: "Task" }),
  Button({ onClick: save }, "Add"),
)
```

`Sheet` — оверлей внутри дерева. Он появляется через изменение opacity, держит
нажатия внутри панели и не закрывается от жеста, которым был открыт.
`dismissible: false` оставляет его открытым при нажатии на подложку.

### Размещение снизу

`placement: "bottom"` — удобная для телефона альтернатива диалогу по центру:

```ts
Sheet(
  {
    placement: "bottom",
    open: app.store.get("actions") === true,
    title: "Task actions",
    handle: true,
    onClose: () => app.store.set("actions", false),
  },
  Button({ variant: "ghost", expand: true, onClick: duplicate }, "Duplicate"),
  Button({ variant: "ghost", expand: true, color: "red", onClick: remove }, "Delete"),
)
```

### Menu и Popover

```ts
Menu({
  open: app.store.get("menu") === true,
  items: [
    { id: "rename", label: "Rename", icon: "edit" },
    { id: "duplicate", label: "Duplicate", icon: "content_copy", shortcut: "CmdOrCtrl+D" },
    { separator: true },
    { id: "delete", label: "Delete", icon: "delete", danger: true },
  ],
  onSelect: (id) => runAction(id),
  onClose: () => app.store.set("menu", false),
})

Popover({ open: app.store.get("info") === true, x: 24, y: 64, onClose: closeInfo }, Text("Floating panel"))
```

`Menu` поддерживает значки, сочетания клавиш, разделители, отключённые элементы
и опасные элементы. Esc и клик снаружи закрывают его.

### Accordion

```ts
Accordion(
  { multiple: true, onChange: (index, open) => console.log(index, open) },
  AccordionSection({ title: "Account", icon: "person" }, accountFields()),
  AccordionSection({ title: "Privacy", icon: "lock", defaultOpen: true }, privacyFields()),
)
```

Секции хранят состояние раскрытия локально; `open` позволяет управлять им
снаружи.

### Snackbar

```ts
Snackbar({
  open: app.store.get("toast") === true,
  text: "Task deleted",
  actionLabel: "Undo",
  duration: 3000,
  onAction: undo,
  onClose: () => app.store.set("toast", false),
})
```

## Обратная связь и состояние

### Progress, Spinner и Skeleton

```ts
Progress({ value: 0.4 })

Spinner({ size: 24 })
Spinner({ size: 24, value: 0.6 })

Skeleton({ variant: "text", width: 220 })
Skeleton({ variant: "circle", width: 40, height: 40 })
Skeleton({ variant: "rect", height: 120, radius: 8 })
```

`Spinner` без `value` неопределённый; `value` от 0 до 1 показывает определённый
прогресс. Варианты `Skeleton` — `text`, `rect` и `circle`.

### EmptyState

```ts
EmptyState({
  icon: "inbox",
  title: "Inbox is empty",
  text: "New messages will appear here.",
  action: Button({ variant: "soft", onClick: refresh }, "Refresh"),
})
```

Используйте его для пустой ветки, а не для ошибок. Для ошибок покажите сообщение
и действие повтора в `Card` или `EmptyState`.

## Списки

### For

`For` строит прокручиваемый список из массива:

```ts
For({
  each: tasks(),
  keyOf: (task) => task.id,
  spacing: 8,
  padding: 12,
  render: (task) => TaskRow({ task }),
})
```

- `keyOf` обязателен для стабильных строк при вставке, удалении или перемещении
  элементов.
- `render` получает элемент и его индекс.

Для десятков тысяч строк используйте `VirtualList`; не рендерите их все.

### VirtualList

```ts
VirtualList({
  items: tasks().map((task) => ({
    key: task.id,
    title: task.text,
    subtitle: task.done ? "Done" : "Open",
    icon: task.done ? "check_circle" : "radio_button_unchecked",
    trailing: task.due,
  })),
  selectable: true,
  selected: selectedIDs(),
  refreshable: true,
  stickySections: true,
  swipeActions: [{ id: "delete", label: "Delete", icon: "delete", color: "red" }],
  onPress: (key) => openTask(String(key)),
  onSelect: (key, selected) => toggleSelection(String(key), selected),
  onAction: (key, action) => runListAction(String(key), action),
  onRefresh: reload,
  onEndReached: loadMore,
})
```

Виртуальные списки используют фиксированную форму элемента (`title`, `subtitle`,
`icon`, `trailing`, `section`). Если строке нужны произвольные компоненты,
используйте `For`.

### Grid

Используйте `Grid` для галереи или дашборда; `VirtualList` — для длинных
однородных строк.

## Темы

### Цвета

Пропы `color` принимают именованные CSS-цвета (`"black"`, `"tomato"`,
`"transparent"`), hex-строки, строки `rgb()`/`hsl()` и пользовательские токены
темы.

```ts
Text({ color: "tomato" }, "Named")
Text({ color: "#7c5cff" }, "Hex")
Text({ color: "brand" }, "Custom token")
```

### theme.set

```ts
await theme.set({
  palette: {
    background: "#131010",
    surface: "#1a1717",
    primary: "#3369ff",
    text: "#b8b2b2",
    textSecondary: "#8b8484",
    border: "#2b2727",
    radius: 8,
    spacing: 12,
  },
  colors: { brand: "#ff5c8a" },
  density: 1,
  fontScale: 1,
  fontFamily: "Paper Mono",
  iconFamily: "Material Symbols Rounded",
  motion: { fast: 90, normal: 160, slow: 260 },
})
```

Пресеты экспортируются как `catppuccinTheme("frappe" | "latte")`.
Пользовательские токены можно типизировать, расширив `ThemeColors`:

```ts
declare module "pulsar" {
  interface ThemeColors {
    brand: string
  }
}
```

### Elevation, градиенты и neon

```ts
Card({ elevation: 2, shadowColor: "black" }, "Raised")

Card({ gradient: { from: "#3369ff", to: "#7c5cff", direction: "horizontal" } }, "Gradient")

Button({ neon: { color: "cyan", intensity: 1.2, glow: 0.8, padding: 12 } }, "Neon")
Button({ neon: true }, "Theme color")
Button({ neon: { effects: false } }, "Plain outline")
```

`effects: false` даёт простой контур вместо свечения; программный рендеринг
автоматически откатывается к контуру.

### Адаптивная раскладка

```ts
const bp = createBreakpoints(app)

app.window("main").render(() => {
  const wide = bp.atLeast("medium")

  return wide
    ? Row({ fill: true }, NavigationRail({ items, index, onChange }), page())
    : Column({ fill: true }, page(), NavBar({ items, value, onChange }))
})
```

`bp.current()` читает текущую контрольную точку. `Store.breakpoint` повторяет её,
а `window-resize` срабатывает при изменении размера окна на desktop и при
повороте или разделении экрана на Android.

## Рецепты

### Форма настроек

```ts
const field = (key: string, placeholder: string) =>
  Input({
    placeholder,
    value: String(app.store.get(key) ?? ""),
    onInput: (value) => app.store.set(key, value),
    expand: true,
  })

Card(
  { padding: 16, gap: 12 },
  Text({ weight: "medium" }, "Profile"),
  field("name", "Name"),
  field("email", "Email"),
  Switch({
    label: "Email notifications",
    checked: app.store.get("notify") === true,
    onToggle: (value) => app.store.set("notify", value),
  }),
  Button({ enabled: valid(), onClick: save }, "Save"),
)
```

### Поиск с состояниями загрузки, пустоты и ошибки

```ts
Column(
  { fill: true, gap: 12, padding: 16 },
  SearchField({ placeholder: "Search", onInput: runSearch }),
  searchBody(),
)
```

```ts
const searchBody = () => {
  if (app.store.get("searching") === true) return Spinner({ size: 24 })

  const error = String(app.store.get("error"))

  if (error !== "") return EmptyState({ icon: "error", title: "Search failed", text: error })
  if (results().length === 0) return EmptyState({ title: "No matches" })

  return For({ each: results(), keyOf: (item) => item.id, render: resultRow })
}
```

Если ветвей больше двух, ранний `return` в функции читается лучше вложенных
тернарных операторов.

### Подтверждение разрушительного действия

```ts
Sheet(
  {
    open: app.store.get("confirmDelete") === true,
    title: "Delete task?",
    dismissible: true,
    onClose: () => app.store.set("confirmDelete", false),
  },
  Text("This cannot be undone."),
  Row(
    { gap: 8, fillWidth: true },
    Spacer({ fillWidth: true }),
    Button({ variant: "ghost", onClick: cancel }, "Cancel"),
    Button({ color: "red", onClick: remove }, "Delete"),
  ),
)
```

### Какой оверлей использовать?

- **Sheet** — блокирующее решение или короткая форма. На телефоне используйте
  `placement: "bottom"` с ручкой перетаскивания.
- **Popover** — небольшая плавающая панель, привязанная к точке.
- **Menu** — список действий; поддерживает сочетания клавиш и опасные элементы.
- **Snackbar** — временное подтверждение, но никогда не обязательное решение.

## Шпаргалка

| Компонент        | Ключевые пропы                                         | Основные события                   |
| ---------------- | ------------------------------------------------------ | ---------------------------------- |
| `Column`/`Row`   | `gap`, `padding`, `fill`, `fillWidth`, `align`         | —                                  |
| `Card`/`Box`     | `padding`, `radius`, `elevation`, `gradient`, `border` | `onLongPress`                      |
| `KeepAlive`      | `active`; содержимое — функция                         | —            |
| `Scroll`         | `fill`, `gap`, `padding`, `overscroll`, `flick`        | —                                  |
| `Shader`         | `source`, `uniforms`, `animated`                       | —               |
| `Wave`/`Lightning`/`Aurora` | `color`, `speed` и другие                   | —               |
| `Orbit`          | `radiusX`, `radiusY`, `speed`, `spin`, `depth`         | —               |
| `Arrange`        | `arrange`, `params`, `animated`, `transition`          | —               |
| `Canvas`         | `draw`, `params`, `animated`, `fps`                    | —               |
| `Text`           | `size`, `weight`, `color`, `markdown`, `elide`         | —                                  |
| `Button`         | `variant`, `size`, `icon`, `badge`, `enabled`          | `onClick`, `onLongPress`           |
| `IconButton`     | `icon`, `size`, `color`, `badge`                       | `onClick`                          |
| `Input`          | `value`, `placeholder`, `password`, `keyboardType`     | `onInput`, `onSubmitted`           |
| `SearchField`    | `debounce`, `value`, `placeholder`                     | `onInput`, `onSubmit`, `onClear`   |
| `Checkbox`       | `checked`, `label`                                     | `onToggle`                         |
| `Switch`         | `checked`, `label`                                     | `onToggle`                         |
| `RadioGroup`     | `options`, `value`, `direction`                        | `onChange`                         |
| `Slider`         | `min`, `max`, `value`                                  | `onChange`                         |
| `RangeSlider`    | `min`, `max`, `from`, `to`, `step`                     | `onChange(from, to)`               |
| `Select`         | `options`, `value`                                     | `onChange`                         |
| `Segmented`      | `items`, `value`                                       | `onChange`                         |
| `Tabs`           | `items`, `index`                                       | `onChange`                         |
| `Pager`          | `index`, `interactive`                                 | `onPageChange`                     |
| `NavBar`         | `items`, `value`, `activeColor`, `showLabels`          | `onChange`                         |
| `NavigationRail` | `items`, `index`, `expanded`, `padding`                | `onChange`                         |
| `Sheet`          | `open`, `title`, `dismissible`, `duration`             | `onClose`                          |
| `Menu`           | `open`, `items`                                        | `onSelect(id)`, `onClose`          |
| `Snackbar`       | `open`, `text`, `actionLabel`, `duration`              | `onAction`, `onClose`              |
| `For`            | `each`, `keyOf`, `render`, `spacing`                   | —                                  |
| `VirtualList`    | `items`, `selectable`, `refreshable`, `swipeActions`   | `onPress`, `onSelect`, `onRefresh` |

## Доступность

Задавайте `a11yLabel` для контролов только со значком и `a11yHint`, когда одного
имени недостаточно:

```ts
IconButton({ icon: "delete", a11yLabel: "Delete task", a11yHint: "This cannot be undone", onClick: remove })
```

Держите интерактивные цели достаточно большими, не передавайте смысл только
цветом и следите, чтобы у диалогов были видимый заголовок и способ закрытия.
