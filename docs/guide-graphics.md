# Graphics and effects

Pulsar draws on the GPU, so a glow, a moving background or a bolt of lightning is a few props,
not a canvas library. This page goes from the easiest tool to the most flexible one.

![A bolt that follows a slider](https://pulsarjs.org/media/lightning.gif)

## A first effect

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

`Lightning` is a ready effect. Moving the slider changes `charge`, and the bolt follows:
`progress` sets how far it reaches, and `jitter` how far it strays. There is no animation
code, because the bolt flickers on the GPU by itself.

## More examples

Each one is a whole app. Paste it into `src/main.tsx` of a new project and run `pulsar dev`. The pictures use the dark theme.

### A player wave

<img src="https://pulsarjs.org/media/wave.gif" alt="A glowing purple wave under a track title" width="480" loading="lazy">

A ready `Wave` under a track title. It moves on the GPU, so it costs almost nothing.

```tsx
import { App, Column, Text, Wave } from "pulsar"

new App().window("main").render(() => (
  <Column fillWidth fillHeight padding={32} gap={8}>
    <Text text="Midnight City" size={24} bold />
    <Text text="M83" color="#7f8590" />
    <Wave fillWidth height={64} color="#c084fc" amplitude={10} frequency={4} speed={3} glowRadius={10} />
  </Column>
))
```

### A glass clock over aurora

<img src="https://pulsarjs.org/media/glass.gif" alt="A frosted clock card over a moving aurora" width="480" loading="lazy">

`glass` blurs the first child of the `Stack`, here an `Aurora`, and tints it.

```tsx
import { App, Aurora, Column, Row, Stack, Text } from "pulsar"

new App().window("main").render(() => (
  <Stack fillWidth fillHeight>
    <Aurora fill color="#2b1055" accent="#0f766e" speed={0.2} />
    <Row fill justify="center" alignItems="center">
      <Column padding={24} radius={20} gap={4} glass={{ blur: 40, tint: "#33ffffff" }} borderWidth={1} borderColor="#40ffffff">
        <Text text="20:45" size={44} bold color="#ffffff" />
        <Text text="Thursday, 6 November" color="#e4e4f0" />
      </Column>
    </Row>
  </Stack>
))
```

### Your own shader

<img src="https://pulsarjs.org/media/pulse.gif" alt="Pink rings pulsing out from the center" width="480" loading="lazy">

A `.frag` file next to the app. Pulsar compiles it on save, and the `uniform` values come from TypeScript.

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

```tsx
import { App, Shader } from "pulsar"

new App().window("main").render(() => (
  <Shader source="shaders/pulse.frag" fill uniforms={{ color: "#ff6ac1", rings: 3 }} />
))
```

### A live chart on Canvas

<img src="https://pulsarjs.org/media/chart.gif" alt="A line chart that scrolls with new values" width="480" loading="lazy">

`draw` gets the data through `params` and redraws when it changes.

```tsx
import { App, Canvas, Column, Text, signal } from "pulsar"

const points = signal(Array.from({ length: 40 }, () => 0.5))

setInterval(() => {
  const last = points.get().at(-1) ?? 0.5
  const next = Math.min(0.95, Math.max(0.05, last + (Math.random() - 0.5) * 0.2))

  points.set([...points.get().slice(1), next])
}, 120)

new App().window("main").render(() => (
  <Column fillWidth fillHeight padding={24} gap={12}>
    <Text text={`CPU ${Math.round((points.get().at(-1) ?? 0) * 100)}%`} size={20} />
    <Canvas
      fillWidth
      fillHeight
      params={{ points: points.get() }}
      draw={(ctx, { width, height, params, colors }) => {
        const step = width / (params.points.length - 1)

        ctx.strokeStyle = colors.primary
        ctx.lineWidth = 2
        ctx.lineJoin = "round"
        ctx.beginPath()
        params.points.forEach((value, index) => ctx.lineTo(index * step, height * (1 - value)))
        ctx.stroke()
        ctx.lineTo(width, height)
        ctx.lineTo(0, height)
        ctx.globalAlpha = 0.15
        ctx.fillStyle = colors.primary
        ctx.fill()
      }}
    />
  </Column>
))
```

### Cards on a ring

<img src="https://pulsarjs.org/media/orbit.gif" alt="Six labels circling on a tilted ring" width="480" loading="lazy">

`Orbit` moves real nodes, so each card keeps its clicks and text.

```tsx
import { App, Box, Orbit, Text } from "pulsar"

const apps = ["Mail", "Music", "Notes", "Maps", "Photos", "Files"]

new App().window("main").render(() => (
  <Orbit fill radiusX={220} radiusY={90} speed={4} depth={0.4}>
    {apps.map((name) => (
      <Box key={name} paddingX={14} paddingY={8} radius={10} color="#1d2030">
        <Text text={name} color="#e4e6f0" />
      </Box>
    ))}
  </Orbit>
))
```
## Which tool to use

| You want                                         | Use                              |
| ------------------------------------------------ | -------------------------------- |
| A wave, a bolt or a soft moving background       | `Wave`, `Lightning`, `Aurora`    |
| Your own glow, pattern or moving light           | `Shader` with a `.frag` file     |
| A chart, a shape with labels, a drawing in steps | `Canvas`                         |
| Real nodes moving along a path                   | `Orbit`, `Arrange`               |
| Frosted surfaces and blurred backdrops           | `blur`, `glass`                  |

Effects need a GPU. Under software rendering, such as some virtual machines, shaders, `blur`
and `glass` are skipped, and `Canvas` still works.

## Shaders

A shader draws on the GPU, so animation costs almost no CPU, and a real glow is cheap. In
one test a screen with a full-screen background, two waves, a bolt and a pulse used 28% of
a core on a phone, where a wave and a bolt on `Canvas` used 81%. There are three levels, and
you do not need the math for the first two.

**Ready effects.** Options only.

```ts
Wave({ height: 40, fillWidth: true, color: "#c084fc", amplitude: 4, frequency: 6, speed: 3 })

Wave({ height: 40, fillWidth: true, color: "#5ce1e6", glowRadius: 8 })

Lightning({ height: 90, fillWidth: true, color: "#8b9dff", progress: 0.7, jitter: 26 })

Aurora({ fill: true, color: "#2b1055", accent: "#0f766e", speed: 0.08 })
```

**Your own effect from ready parts.** Put a `.frag` file in the app. Pulsar compiles it when
you run `pulsar dev` or `pulsar build`, and recompiles it on save. You write one function
that returns a color for a point:

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

`uniform` lines become values you pass from TypeScript: a number, a color string, or an
array of 2 to 4 numbers. Return a plain color, and Pulsar handles the alpha.

| Name                         | What it gives you                                      |
| ---------------------------- | ------------------------------------------------------ |
| `uv`                         | The point, from 0 to 1 across the node.                |
| `pixel`                      | The same point in pixels.                              |
| `resolution`                 | The size of the node in pixels.                        |
| `time`                       | Seconds since it appeared. Stops with `animated: false`. |
| `wave(x, frequency, speed)`  | A moving wave from -1 to 1. No need for `sin` and pi.  |
| `noise(x)`, `noise(point)`   | Smooth randomness from 0 to 1.                         |
| `fbm(point)`                 | Cloud-like randomness, for smoke and flow.             |
| `zigzag(x, seed)`            | Sharp randomness from -1 to 1, for bolts.              |
| `segment(point, from, to)`   | Distance to a line segment.                            |
| `line(distance)`             | A crisp edge from a distance.                          |
| `glow(distance, radius)`     | A soft light that fades over `radius`.                 |
| `fade(distance, size)`       | A ramp from 0 to 1 over `size`.                        |

Most effects follow the same recipe: find the **distance** from the point to your shape, then
turn it into light with `line` and `glow`.

**Any GLSL.** Inside `effect` you have the whole language. A mistake is reported with the line
number in your file.

Things to know:

- A uniform cannot be added to a node after it is created. To change the set, give the node a
  new `key`.
- Shaders need a GPU. Under software rendering, such as some virtual machines, the node is empty.
  `Canvas` is the fallback.
- Commit the `.frag.qsb` file or let the build create it. It is what ships in the app.

Use `Canvas` when you draw something structured, such as a chart with labels. Use a shader for
effects that move all the time.

## Blur, glass and rotation

`blur` softens a node and everything in it, for example a color backdrop from album art:

```ts
Image({ src: cover, fill: true, blur: 48 })
```

`glass` makes a surface see-through: it shows the **first child of the nearest `Stack`**, blurred,
with a tint on top. Every pane in a `Stack` shares one blurred copy, so many panes cost about the
same as one, and a pane may keep moving.

```ts
Stack(
  { fill: true },
  Image({ src: wallpaper, fill: true }),
  Column({ width: 56, height: 92, radius: 26, glass: { blur: 48, tint: "#22ffffff" } }, Text({ text: "20:00" })),
)
```

`rotation` sets an angle in degrees, and `spinSpeed` keeps turning in turns per minute, without
running any JavaScript:

```ts
Image({ src: cover, width: 74, height: 74, spinSpeed: 12 })
```

`Lightning` can run between any two points, given as a share of the node's size:

```ts
Lightning({ fill: true, from: [0.5, 0.5], to: [0.1, 0.1], jitter: 10, glowRadius: 10 })
```

A node with `blur` does not show its `elevation` shadow. Without a GPU, `blur` and `glass` are skipped.

## Orbit and Arrange

`Canvas` and `Shader` draw pictures. `Arrange` moves **real nodes** every frame, so they keep
their clicks, hover and text, and nothing crosses the bridge.

`Orbit` is the ready form. It places children on a ring and needs no math:

```ts
Orbit(
  { fill: true, radiusX: 260, radiusY: 120, speed: 1, depth: 0.35, spin: spin.get(), transition: { duration: 850 } },
  ...hours.map((hour) => HourPill({ key: hour.time, hour })),
)
```

Depth comes from three things together: a flattened ellipse, a stronger `scale` and a lower
`opacity` on the far side, and `z` so the near side overlaps. With only one of them the ring
looks flat.

With `Arrange` you say where each child goes. It returns the child's center and, if you like,
`scale`, `rotation`, `opacity` and `z`:

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

Like `Canvas`, `arrange` runs in the renderer, so it cannot read outer variables. Pass data
through `params`. Set `animated` when the layout keeps moving; otherwise it runs only when
something changes.

Numbers in `params` **glide** to a new value over `transition`, so one `set` starts the whole
animation. In the example above, one full `spin` makes the ring whip around, fading out and
back. To change the data unseen, swap it while the ring is faded out:

```ts
const pickDay = (next: number) => {
  spin.set(spin.peek() + 6.2831853)
  setTimeout(() => shownDay.set(next), 170)
}
```

## Canvas

`Canvas` draws anything a `Column` cannot: a wave in a player, lightning, a chart. The
`ctx` works like the browser's 2D context.

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

In JSX it is the same:

```tsx
<Canvas height={40} fillWidth animated draw={(ctx, { width }) => ctx.fillRect(0, 0, width, 4)} />
```

`draw` runs in the renderer, not in your JavaScript, so a frame never crosses the bridge.
A wave drawn this way cost a third of the CPU of the same wave computed in JavaScript and
sent each frame. That has one rule:

- **`draw` cannot read outer variables.** Pass data through `params`; when `params`
  changes, it redraws. Reading an outer name logs a clear error. Write it as an arrow
  function.

`draw` receives `width`, `height`, `time` in seconds, `params` and the theme's `colors`.
Without `animated` it redraws only when `params` changes. An animated canvas stops while
hidden.

**Keep it cheap.** The drawing runs on the CPU:

- For a glow or anything that moves all the time, prefer a [`Shader`](#shaders).
- Avoid `shadowBlur`. In one test it tripled the cost of a shape. Layered translucent
  strokes look like a glow for far less:

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

- Set `fps` when the picture changes slowly. Animated canvases are capped at 60 by default,
  including on 120 Hz screens, and `fps: 0` removes the cap.
