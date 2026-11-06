# Графика и эффекты

Pulsar рисует на видеокарте, поэтому свечение, движущийся фон или молния — это несколько
свойств, а не отдельная библиотека для рисования. Страница идёт от самого простого инструмента
к самому гибкому.

![Молния следует за ползунком](https://pulsarjs.org/media/lightning.gif)

## Первый эффект

```tsx
import { App, Column, Lightning, Slider, Stack, Text, signal, theme } from "pulsar"

theme.set({ palette: { background: "#0e0f12", primary: "#8b9dff", text: "#c8ccd4" } })

const charge = signal(60)

new App().window("main").render(() => (
  <Column fillWidth fillHeight padding={24} gap={16}>
    <Text text={`Charge ${charge.get()}%`} size={20} />
    <Stack fillWidth height={220} radius={12} color="#15171c">
      <Lightning
        fill
        from={[0.1, 0.5]}
        to={[0.9, 0.5]}
        progress={charge.get() / 100}
        jitter={8 + charge.get() / 3}
        glowRadius={14}
        color="#8b9dff"
      />
    </Stack>
    <Slider fillWidth value={charge.get()} onChange={(value) => charge.set(Math.round(value))} />
  </Column>
))
```

`Lightning` — готовый эффект. Ползунок меняет `charge`, и молния следует за ним: `progress`
задаёт, как далеко она доходит, а `jitter` — насколько отклоняется. Кода анимации нет: молния
мерцает на видеокарте сама.

## Что выбрать

| Нужно                                              | Используйте                      |
| -------------------------------------------------- | -------------------------------- |
| Волна, молния или мягкий движущийся фон            | `Wave`, `Lightning`, `Aurora`    |
| Своё свечение, узор или движущийся свет            | `Shader` с файлом `.frag`        |
| График, фигура с подписями, рисунок по шагам       | `Canvas`                         |
| Настоящие узлы, движущиеся по траектории           | `Orbit`, `Arrange`               |
| Матовые поверхности и размытый фон                 | `blur`, `glass`                  |

Эффектам нужна видеокарта. При программной отрисовке, например в некоторых виртуальных машинах,
шейдеры, `blur` и `glass` пропускаются, а `Canvas` продолжает работать.

## Шейдеры

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

## Размытие, стекло и вращение

`blur` размывает узел со всем содержимым, например фон из обложки альбома:

```ts
Image({ src: cover, fill: true, blur: 48 })
```

`glass` делает поверхность полупрозрачной: она показывает **первого ребёнка ближайшего `Stack`** в
размытом виде, с оттенком сверху. Все панели в одном `Stack` используют одну размытую копию, поэтому
много панелей стоят почти как одна, и панель может двигаться.

```ts
Stack(
  { fill: true },
  Image({ src: wallpaper, fill: true }),
  Column({ width: 56, height: 92, radius: 26, glass: { blur: 48, tint: "#22ffffff" } }, Text({ text: "20:00" })),
)
```

`rotation` задаёт угол в градусах, а `spinSpeed` вращает узел постоянно, в оборотах в минуту, без
JavaScript:

```ts
Image({ src: cover, width: 74, height: 74, spinSpeed: 12 })
```

`Lightning` может идти между любыми двумя точками, заданными долей от размера узла:

```ts
Lightning({ fill: true, from: [0.5, 0.5], to: [0.1, 0.1], jitter: 10, glowRadius: 10 })
```

Узел с `blur` не показывает тень `elevation`. Без видеокарты `blur` и `glass` пропускаются.

## Orbit и Arrange

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

## Canvas

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

- Для свечения и постоянного движения лучше подойдёт [`Shader`](#sheydery).
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
