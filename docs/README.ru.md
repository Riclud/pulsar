<p align="center">
  <a href="../README.md">English</a> ·
  <strong>Русский</strong>
</p>

# Pulsar

Нативные приложения на TypeScript для компьютера и Android без браузерного движка.
Интерфейс пишется функциями или JSX, а рисует его Qt на GPU.

![Правка кода слева обновляет работающее приложение справа](media/pulsar-demo.gif)

<sub>Ввод идёт по сценарию, но файлы и перезагрузка через `pulsar dev` настоящие. Панель
кода — тоже небольшое приложение на Pulsar: [`examples/tasks/demo`](../examples/tasks/demo).</sub>

## Быстрый старт

Заранее ничего ставить не нужно: Bun уже внутри CLI.

```sh
curl -fsSL https://get.pulsarjs.org | sh
```

В Windows выполните `powershell -c "irm https://get.pulsarjs.org/install.ps1 | iex"`.
Затем создайте приложение:

```sh
pulsar create my-app
cd my-app
pulsar dev
```

Сохраните файл, и открытое окно обновится.

```tsx
import { App, Button, Column, Text, signal } from "pulsar"

const count = signal(0)

new App().window("main").render(() => (
  <Column fillWidth fillHeight padding={24} gap={12}>
    <Text text={`Count: ${count.get()}`} size={20} />
    <Button label="+1" onClick={() => count.set(count.get() + 1)} />
  </Column>
))
```

## Зачем Pulsar

- **Один код:** он работает на Linux, macOS, Windows и Android.
- **Один файл для поставки:** `pulsar build` создаёт один исполняемый файл, а
  `pulsar build --target android` — подписанный APK.
- **Нативная отрисовка:** Chromium нет, а анимации, шейдеры, размытие и стекло уже
  встроены.
- **Лёгкие приложения:** приложение для компьютера работает на QuickJS и весит около
  30 МБ. Bun или Node попадают в него, только если коду они нужны, а `pulsar check`
  скажет, какой именно.
- **Готов для ИИ-агентов:** `pulsar mcp` даёт агенту запускать, видеть и проверять
  приложение, которое он пишет.

## ИИ-агенты

В Pulsar встроен [MCP](https://modelcontextprotocol.io)-сервер: ИИ-агент запускает ваше
приложение, смотрит на него и прокликивает, пока пишет код. Приложение работает без окна,
а ваши мышь и клавиатура агенту не нужны.

```sh
claude mcp add pulsar -- pulsar mcp
```

Для [opencode](https://opencode.ai) — командой в терминале или в `opencode.jsonc`:

```sh
opencode mcp add pulsar -- pulsar mcp
```

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "pulsar": { "type": "local", "command": ["pulsar", "mcp"] },
    },
  },
}
```

Другие MCP-клиенты (Cursor, Codex, Zed и другие) запускают ту же команду, `pulsar mcp`,
через stdio. Агент получает:

- `pulsar_start` и `pulsar_stop`, чтобы запускать приложение с перезагрузкой на лету, без
  окна или в окне;
- `pulsar_ui`, дерево интерфейса коротким списком, и `pulsar_screenshot`;
- `pulsar_click`, `pulsar_hover`, `pulsar_scroll`, `pulsar_type` и `pulsar_key`, которые
  приходят в окно как настоящий ввод;
- `pulsar_wait_for`, `pulsar_state`, `pulsar_eval` и `pulsar_logs`, чтобы проверить результат.

То же управление работает из терминала рядом с `pulsar dev`: `pulsar ui`, `tap`, `hover`,
`scroll`, `keys` и `shot`.

Чтобы агент знал сам Pulsar, поставьте скилл. Это API, компоненты и вёрстка вашей
установленной версии, так что агенту не нужно искать по документации и GitHub:

```sh
pulsar skill            # в .claude/skills/pulsar этого проекта
pulsar skill --global   # для всех проектов
```

Claude Code и opencode читают `.claude/skills`; `--dir <путь>` кладёт скилл куда угодно.

## Платформы

| Платформа           | Самодостаточно | Статус                  |
| ------------------- | -------------- | ----------------------- |
| Linux x64           | да             | проверено               |
| Linux ARM64         | да             | собрано в CI            |
| macOS Apple Silicon | да             | проверено               |
| macOS Intel         | да             | собрано в CI            |
| Windows x64         | да             | проверено               |
| Windows ARM64       | да             | собрано в CI            |
| Android ARM64       | только APK     | проверено на устройстве |
| iOS Simulator       | из исходников  | экспериментально        |

## Документация

Всё остальное на **[pulsarjs.org](https://pulsarjs.org/ru/)**:

- [Соберите приложение](https://pulsarjs.org/ru/guide/): полное приложение задач с нуля
- [Если вы пришли из веба](https://pulsarjs.org/ru/guide/web/): для тех, кто знает CSS и React
- [CLI](https://pulsarjs.org/ru/cli/) и [манифест](https://pulsarjs.org/ru/manifest/)
- [Сборка из исходников](https://pulsarjs.org/ru/building/)

Тот же справочник лежит в [`reference.ru.md`](reference.ru.md), а история изменений — в
[`CHANGELOG.md`](../CHANGELOG.md).

## Лицензия

MIT, см. [`LICENSE`](../LICENSE). Pulsar динамически линкует Qt (LGPL-3.0), см.
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
