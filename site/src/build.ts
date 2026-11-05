import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import MarkdownIt from "markdown-it"
import anchor from "markdown-it-anchor"
import { createHighlighter } from "shiki"

type Lang = "en" | "ru"

interface TocItem {
  id: string
  title: string
  depth: number
}

interface Page {
  lang: Lang
  slug: string
  path: string
  title: string
  navTitle?: string
  description: string
  html: string
  toc: TocItem[]
  text: string
  alt: string
  source?: string
  sourcePath?: string
  isHome?: boolean
}

interface Section {
  heading: string
  body: string
}

const SITE = resolve(import.meta.dir, "..")
const ROOT = resolve(SITE, "..")
const DIST = join(SITE, "dist")
const SRC = join(SITE, "src")
const PUBLIC = join(SITE, "public")

const BASE = (process.env.BASE_PATH ?? "").trim().replace(/\/+$/, "").replace(/^\/*/, "/").replace(/^\/$/, "")
const CNAME = join(PUBLIC, "CNAME")
const DOMAIN = (process.env.DOCS_DOMAIN ?? (existsSync(CNAME) ? readFileSync(CNAME, "utf8") : ""))
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "")
const BUILD_ID = Date.now().toString(36)
const VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version

const sitePath = (path: string): string => {
  const clean = path.replace(/^\/+/, "")
  return `${BASE}/${clean}`.replace(/\/{2,}/g, "/")
}

const translit: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
}

const slugify = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[а-яё]/g, (char) => translit[char] ?? char)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "section"
}

const looseSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
}

const stripTags = (html: string): string => {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const escapeHTML = (value: string): string => {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const splitSections = (source: string): Section[] => {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  const sections: Section[] = []

  let heading = ""
  let body: string[] = []
  let inFence = false

  const push = () => {
    if (heading || body.join("").trim()) sections.push({ heading, body: body.join("\n") })
  }

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence

    if (!inFence && /^## /.test(line)) {
      push()
      heading = line.slice(3).trim()
      body = []
      continue
    }

    body.push(line)
  }

  push()

  return sections
}

const stripH1 = (source: string): string => {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  let removed = false
  const out: string[] = []

  for (const line of lines) {
    if (!removed && /^# /.test(line)) {
      removed = true
      continue
    }

    out.push(line)
  }

  return out.join("\n")
}

const rewriteLinks = (html: string, page: Page, anchors: Map<string, { page: Page; id: string }>): string => {
  return html.replace(/href="([^"]+)"/g, (match, href: string) => {
    if (/^(https?:|mailto:|tel:|data:)/.test(href)) return match

    if (href.startsWith("#")) {
      const local = decodeURIComponent(href.slice(1))
      if (html.includes(`id="${local}"`)) return match

      const key = local.toLowerCase()
      const target = anchors.get(key) ?? anchors.get(href.slice(1).toLowerCase())

      if (!target) return match
      if (target.page === page) return `href="#${target.id}"`

      return `href="${target.page.path}#${target.id}"`
    }

    const clean = href.replace(/^\.\//, "").replace(/^\.\.\//, "")
    const fileMap: Record<string, string> = {
      "README.md": "",
      "CHANGELOG.md": "changelog/",
      "docs/protocol.md": "protocol-internals/",
      "protocol.md": "protocol-internals/",
      "docs/README.ru.md": "ru/",
      "docs/guide-web.md": "guide/web/",
      "docs/guide-components.md": "guide/components/",
      "guide-web.md": "guide/web/",
      "guide-components.md": "guide/components/",
      "guide-ui.md": "guide/ui/",
      "guide-ui.ru.md": "ru/guide/ui/",
      "guide-web.ru.md": "ru/guide/web/",
      "guide-components.ru.md": "ru/guide/components/",
      LICENSE: "https://github.com/riclud/pulsar/blob/main/LICENSE",
      "THIRD_PARTY_NOTICES.md": "https://github.com/riclud/pulsar/blob/main/THIRD_PARTY_NOTICES.md",
      "examples/hello": "https://github.com/riclud/pulsar/tree/main/examples/hello",
      "examples/windows": "https://github.com/riclud/pulsar/tree/main/examples/windows",
    }

    const mapped = fileMap[clean] ?? fileMap[href]
    if (mapped === undefined) return match
    if (mapped.startsWith("https://")) return `href="${mapped}" rel="noopener"`

    return `href="${sitePath(mapped)}"`
  })
}

const buildHighlighter = async () => {
  return createHighlighter({
    themes: ["github-dark-default", "github-light-default"],
    langs: ["tsx", "ts", "json", "sh", "bash", "powershell", "qml", "ini", "yaml", "markdown", "cpp", "plaintext"],
  })
}

const makeMarkdown = (highlighter: Awaited<ReturnType<typeof buildHighlighter>>) => {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    highlight: (code, lang) => {
      const loaded = highlighter.getLoadedLanguages()
      const language = lang && loaded.includes(lang) ? lang : "plaintext"

      return highlighter.codeToHtml(code, {
        lang: language,
        themes: { light: "github-light-default", dark: "github-dark-default" },
        defaultColor: false,
      })
    },
  })

  md.use(anchor, {
    slugify,
    permalink: anchor.permalink.linkInsideHeader({
      symbol: "#",
      placement: "after",
      ariaHidden: true,
      class: "header-anchor",
    }),
  })

  return md
}

const extractToc = (html: string): TocItem[] => {
  const items: TocItem[] = []
  const re = /<h([2-4]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g
  let match: RegExpExecArray | null

  while ((match = re.exec(html)) !== null) {
    const clean = match[3]!.replace(/<a class="header-anchor"[\s\S]*?<\/a>/g, "")
    items.push({ depth: Number(match[1]), id: match[2]!, title: stripTags(clean) })
  }

  return items
}

const extractAnchors = (html: string, page: Page, anchors: Map<string, { page: Page; id: string }>) => {
  const re = /<h([1-6]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g
  let match: RegExpExecArray | null

  while ((match = re.exec(html)) !== null) {
    const id = match[2]!
    const raw = stripTags(match[3]!)

    anchors.set(id.toLowerCase(), { page, id })
    anchors.set(looseSlug(raw), { page, id })
    anchors.set(raw.toLowerCase(), { page, id })
  }
}

const pagesFor = (lang: Lang): Page[] => {
  const source = readFileSync(join(ROOT, lang === "en" ? "docs/reference.md" : "docs/reference.ru.md"), "utf8")
  const sections = splitSections(source).filter((section) => section.heading)
  const enSections = splitSections(readFileSync(join(ROOT, "docs/reference.md"), "utf8")).filter((section) => section.heading)

  return sections.map((section, index) => {
    const slug = slugs[index] ?? slugify((enSections[index]?.heading ?? section.heading).replace(/[`*]/g, ""))
    const path = lang === "en" ? sitePath(`${slug}/`) : sitePath(`ru/${slug}/`)
    const title = section.heading.replace(/`/g, "")

    return {
      lang,
      slug,
      path,
      title,
      navTitle: navTitles[lang]?.[slug],
      description: "",
      html: "",
      toc: [],
      text: section.body,
      alt: "",
      source: section.body,
    }
  })
}

const navTitles: Record<Lang, Record<string, string>> = {
  en: { manifest: "Manifest", "app-api": "App API", qml: "QML API" },
  ru: { manifest: "Манифест", "app-api": "App API", qml: "QML API" },
}

const slugs = [
  "platforms",
  "requirements",
  "install",
  "quick-start",
  "cli",
  "manifest",
  "app-api",
  "ui",
  "qml",
  "templates",
  "building",
  "protocol",
  "repository",
  "testing",
  "license",
]

const navGroups: Record<Lang, Array<{ label: string; slugs: string[] }>> = {
  en: [
    { label: "Guide", slugs: ["guide/web", "guide", "guide/components", "guide/api"] },
    { label: "Setup", slugs: ["platforms", "requirements", "install", "quick-start"] },
    { label: "Reference", slugs: ["cli", "manifest", "app-api", "ui", "qml"] },
    {
      label: "Project",
      slugs: ["templates", "building", "protocol", "protocol-internals", "repository", "testing", "license"],
    },
  ],
  ru: [
    { label: "Руководство", slugs: ["guide/web", "guide", "guide/components", "guide/api"] },
    { label: "Установка", slugs: ["platforms", "requirements", "install", "quick-start"] },
    { label: "Справочник", slugs: ["cli", "manifest", "app-api", "ui", "qml"] },
    {
      label: "Проект",
      slugs: ["templates", "building", "protocol", "protocol-internals", "repository", "testing", "license"],
    },
  ],
}

const ui = {
  en: {
    overview: "Overview",
    docs: "Docs",
    changelog: "Changelog",
    protocol: "Protocol internals",
    search: "Search",
    searchHint: "Search the docs",
    searchEmpty: "Type to search documentation.",
    noResults: "No results.",
    onThisPage: "On this page",
    previous: "Previous",
    next: "Next",
    edit: "Edit on GitHub",
    language: "Русский",
    languageName: "English",
    languageShort: "EN",
    switchLanguage: "Switch to Русский",
    skip: "Skip to content",
    dark: "Switch to light theme",
    light: "Switch to dark theme",
    menu: "Toggle navigation",
    install: "Install",
    copy: "Copy",
    copied: "Copied",
    guide: "Guide",
    changelogNote: "",
    protocolNote: "",
  },
  ru: {
    overview: "Обзор",
    docs: "Документация",
    changelog: "История изменений",
    protocol: "Внутренний протокол",
    search: "Поиск",
    searchHint: "Поиск по документации",
    searchEmpty: "Начните печатать, чтобы искать.",
    noResults: "Ничего не найдено.",
    onThisPage: "На этой странице",
    previous: "Назад",
    next: "Далее",
    edit: "Редактировать на GitHub",
    language: "English",
    languageName: "Русский",
    languageShort: "RU",
    switchLanguage: "Переключить на English",
    skip: "Перейти к содержимому",
    dark: "Светлая тема",
    light: "Тёмная тема",
    menu: "Открыть навигацию",
    install: "Установка",
    copy: "Копировать",
    copied: "Скопировано",
    guide: "Руководство",
    changelogNote: "История изменений ведётся на английском языке.",
    protocolNote: "Внутренний протокол описан на английском языке.",
  },
}

const homeText = {
  en: {
    eyebrow: "Native apps in TypeScript",
    title: "Write TypeScript.<br>Ship <em>native</em>.",
    lead: "Pulsar is an app framework with a declarative TypeScript UI, drawn by Qt on the GPU with no browser inside. It packages into a single executable and builds Android APKs from the same code.",
    start: "Start building",
    fromWeb: "Coming from the web",
    sampleKicker: "Familiar from day one",
    sampleTitle: "If you know flexbox, you can already read this",
    sampleText: "Functions or JSX tags, whichever you prefer, and props instead of CSS. Controls come ready, with their states and theme.",
    sampleTabs: "Code style",
    tasks: ["Buy coffee", "Call Anna", "Ship the update"],
    tasksTitle: "Tasks",
    tasksLeft: "2 left",
    playKicker: "Try it",
    playTitle: "Layout, the way you expect",
    playText: "This is the prop on a real Row. Pick a value and watch the same result you would get in the app.",
    alignLabel: "alignItems",
    signalKicker: "Reactivity",
    signalTitle: "Only what changed runs again",
    signalText: "A component records what it reads. Press a button: only the part that read that value renders, and the rest of the screen is not touched.",
    signalNames: ["Header", "Search", "Task list"],
    signalReads: ["reads count", "reads query", "reads tasks"],
    signalButtons: ["count + 1", "type in search", "add a task"],
    signalRenders: "renders",
    featuresTitle: "What is in the box",
    features: [
      ["Native rendering", "Qt Quick draws on the GPU. No Chromium, and a real native window."],
      ["Components and signals", "Local state, lifecycle and fine-grained updates, with no hook rules."],
      ["Motion in the renderer", "Press, enter, exit and drag stay smooth even while JavaScript is busy."],
      ["One codebase", "Linux, macOS, Windows and Android from the same TypeScript."],
      ["The whole OS", "Files, network, secure storage, notifications, tray, media and more."],
      ["Testable by agents", "pulsar tap, type, expect, shot and eval drive a running app by its UI tree."],
    ],
    pathsTitle: "Where to go next",
    paths: [
      ["guide/web/", "Coming from the web", "What Box, Row and Stack are, in CSS terms."],
      ["guide/", "Build an app", "A complete task app, from an empty project."],
      ["guide/components/", "Components and signals", "State, props, keys and lifecycle."],
      ["ui/", "UI building blocks", "Every component and prop."],
      ["guide/api/", "API tour", "Windows, storage, network and devices."],
      ["cli/", "CLI reference", "Create, run, build and inspect."],
    ],
  },
  ru: {
    eyebrow: "Нативные приложения на TypeScript",
    title: "Пишите на TypeScript.<br>Выпускайте <em>нативное</em>.",
    lead: "Pulsar — фреймворк приложений с декларативным интерфейсом на TypeScript, который Qt рисует на GPU без браузера внутри. Он собирается в один исполняемый файл и делает Android APK из того же кода.",
    start: "Начать",
    fromWeb: "Если вы пришли из веба",
    sampleKicker: "Знакомо с первого дня",
    sampleTitle: "Если вы знаете flexbox, вы уже можете это читать",
    sampleText: "Функции или JSX-теги, как вам удобнее, и свойства вместо CSS. Элементы управления уже готовы, с состояниями и темой.",
    sampleTabs: "Стиль кода",
    tasks: ["Купить кофе", "Позвонить Анне", "Выпустить обновление"],
    tasksTitle: "Задачи",
    tasksLeft: "Осталось: 2",
    playKicker: "Попробуйте",
    playTitle: "Раскладка, как вы и ожидаете",
    playText: "Это свойство настоящего Row. Выберите значение и посмотрите на результат, такой же, как в приложении.",
    alignLabel: "alignItems",
    signalKicker: "Реактивность",
    signalTitle: "Запускается заново только то, что изменилось",
    signalText: "Компонент запоминает, что прочитал. Нажмите кнопку: перерисуется только часть, прочитавшая это значение, а остальной экран останется нетронутым.",
    signalNames: ["Шапка", "Поиск", "Список задач"],
    signalReads: ["читает count", "читает query", "читает tasks"],
    signalButtons: ["count + 1", "ввод в поиске", "добавить задачу"],
    signalRenders: "рендеров",
    featuresTitle: "Что внутри",
    features: [
      ["Нативная отрисовка", "Qt Quick рисует на GPU. Без Chromium и в настоящем нативном окне."],
      ["Компоненты и сигналы", "Локальное состояние, жизненный цикл и точечные обновления без правил хуков."],
      ["Движение в рендерере", "Нажатие, появление, исчезновение и свайп остаются плавными, даже когда JavaScript занят."],
      ["Один код", "Linux, macOS, Windows и Android из одного TypeScript."],
      ["Вся ОС", "Файлы, сеть, защищённое хранилище, уведомления, трей, медиа и многое другое."],
      ["Удобно для агентов", "pulsar tap, type, expect, shot и eval управляют запущенным приложением по дереву UI."],
    ],
    pathsTitle: "Куда дальше",
    paths: [
      ["guide/web/", "Если вы пришли из веба", "Что такое Box, Row и Stack в терминах CSS."],
      ["guide/", "Соберите приложение", "Полное приложение задач с нуля."],
      ["guide/components/", "Компоненты и сигналы", "Состояние, свойства, ключи и жизненный цикл."],
      ["ui/", "UI-блоки", "Все компоненты и свойства."],
      ["guide/api/", "Тур по API", "Окна, хранилище, сеть и устройства."],
      ["cli/", "CLI", "Создание, запуск, сборка и проверка."],
    ],
  },
}

const homeSample = (title: string, left: string): string => {
  return `const TaskRow = component<{ key: string; task: Task }>(({ task }) => {
  return Row(
    {
      color: "surface",
      radius: 10,
      padding: 12,
      gap: 10,
      alignItems: "center",
      fillWidth: true,
      pressed: { scale: 0.98 },
      drag: { axis: "x", onRelease: () => toggle(task) },
    },
    Checkbox({ checked: task.done, onToggle: () => toggle(task) }),
    Text({ text: task.text, strike: task.done, flex: 1 }),
  )
})

app.window().render(() => {
  return Column(
    { fill: true, padding: 16, gap: 8 },
    Text({ text: "${title}", size: 24, weight: "semibold" }),
    Text({ text: \`${left}\`, size: 12 }),
    ...state.tasks.map((task) => TaskRow({ key: task.id, task })),
  )
})`
}

const homeSampleJsx = (title: string, left: string): string => {
  return `const TaskRow = component<{ key: string; task: Task }>(({ task }) => {
  return (
    <Row
      color="surface"
      radius={10}
      padding={12}
      gap={10}
      alignItems="center"
      fillWidth
      pressed={{ scale: 0.98 }}
      drag={{ axis: "x", onRelease: () => toggle(task) }}
    >
      <Checkbox checked={task.done} onToggle={() => toggle(task)} />
      <Text text={task.text} strike={task.done} flex={1} />
    </Row>
  )
})

app.window().render(() => {
  return (
    <Column fill padding={16} gap={8}>
      <Text text="${title}" size={24} weight="semibold" />
      <Text text={\`${left}\`} size={12} />
      {state.tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </Column>
  )
})`
}

const homePage = (lang: Lang, md: ReturnType<typeof makeMarkdown>): Page => {
  const t = ui[lang]
  const c = homeText[lang]
  const prefix = lang === "en" ? "" : "ru/"
  const local = (path: string) => sitePath(`${prefix}${path}`)
  const install = "curl -fsSL https://get.pulsarjs.org | sh&#10;pulsar install"

  const content = `<section class="hero">
  <canvas class="pulsar-canvas" aria-hidden="true"></canvas>
  <div class="hero-copy">
    <p class="eyebrow"><span class="eyebrow-dot"></span>${c.eyebrow} · v${VERSION}</p>
    <h1>${c.title}</h1>
    <p class="lead">${c.lead}</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="${local("guide/")}">${c.start} <span aria-hidden="true">→</span></a>
      <a class="btn" href="${local("guide/web/")}">${c.fromWeb}</a>
    </div>
    <div class="install">
      <div class="install-head"><span>${t.install}</span><button class="copy" data-copy="${install}">${t.copy}</button></div>
      <pre><code>curl -fsSL https://get.pulsarjs.org | sh
pulsar install</code></pre>
    </div>
    <p class="home-platforms">Linux · macOS · Windows · Android</p>
  </div>
</section>

<section class="band band-sample">
  <div class="band-head">
    <p class="kicker">${c.sampleKicker}</p>
    <h2>${c.sampleTitle}</h2>
    <p>${c.sampleText}</p>
  </div>
  <div class="sample">
    <div class="sample-code prose" data-sample>
      <div class="sample-tabs" role="tablist" aria-label="${c.sampleTabs}">
        <button class="sample-tab is-active" role="tab" aria-selected="true" data-sample-tab="ts">TypeScript</button>
        <button class="sample-tab" role="tab" aria-selected="false" data-sample-tab="jsx">JSX</button>
      </div>
      <div data-sample-panel="ts">${md.render("```ts\n" + homeSample(c.tasksTitle, lang === "en" ? "${open.get()} left" : "Осталось: ${open.get()}") + "\n```")}</div>
      <div data-sample-panel="jsx" hidden>${md.render("```tsx\n" + homeSampleJsx(c.tasksTitle, lang === "en" ? "${open.get()} left" : "Осталось: ${open.get()}") + "\n```")}</div>
    </div>
    <div class="phone" aria-hidden="true">
      <div class="phone-screen">
        <p class="phone-title">${c.tasksTitle}</p>
        <p class="phone-sub">${c.tasksLeft}</p>
        ${c.tasks
          .map((task, index) => `<div class="phone-row${index === 0 ? " is-done" : ""}${index === 1 ? " is-swiping" : ""}"><span class="phone-check"></span><span>${task}</span></div>`)
          .join("")}
      </div>
    </div>
  </div>
</section>

<section class="band">
  <div class="band-head">
    <p class="kicker">${c.playKicker}</p>
    <h2>${c.playTitle}</h2>
    <p>${c.playText}</p>
  </div>
  <div class="playground" data-playground>
    <div class="play-controls">
      <div class="segment" role="group" aria-label="justify">
        <span class="segment-label">justify</span>
        ${["start", "center", "end", "between", "around", "evenly"].map((value) => `<button data-justify="${value}"${value === "between" ? ' aria-pressed="true"' : ""}>${value}</button>`).join("")}
      </div>
      <div class="segment" role="group" aria-label="${c.alignLabel}">
        <span class="segment-label">${c.alignLabel}</span>
        ${["start", "center", "end"].map((value) => `<button data-align="${value}"${value === "center" ? ' aria-pressed="true"' : ""}>${value}</button>`).join("")}
      </div>
    </div>
    <div class="play-stage"><div class="play-row"><i class="tile tile-a"></i><i class="tile tile-b"></i><i class="tile tile-c"></i></div></div>
    <pre class="play-code"><code></code></pre>
  </div>
</section>

<section class="band">
  <div class="band-head">
    <p class="kicker">${c.signalKicker}</p>
    <h2>${c.signalTitle}</h2>
    <p>${c.signalText}</p>
  </div>
  <div class="signals" data-signals data-label="${c.signalRenders}">
    <div class="signal-grid">
      ${c.signalNames
        .map((name, index) => `<div class="signal-card" data-card="${index}"><p class="signal-name">${name}</p><p class="signal-reads">${c.signalReads[index]}</p><p class="signal-count"><b>1</b> ${c.signalRenders}</p></div>`)
        .join("")}
    </div>
    <div class="signal-actions">
      ${c.signalButtons.map((label, index) => `<button class="btn" data-trigger="${index}">${label}</button>`).join("")}
    </div>
  </div>
</section>

<section class="band">
  <div class="band-head"><h2>${c.featuresTitle}</h2></div>
  <div class="feature-grid">
    ${c.features.map(([title, text]) => `<div class="feature"><h3>${title}</h3><p>${text}</p></div>`).join("")}
  </div>
</section>

<section class="band band-last">
  <div class="band-head"><h2>${c.pathsTitle}</h2></div>
  <div class="path-grid">
    ${c.paths.map(([path, title, text]) => `<a class="path" href="${local(path!)}"><span class="path-title">${title} <span aria-hidden="true">→</span></span><span class="path-text">${text}</span></a>`).join("")}
  </div>
</section>`

  return {
    lang,
    slug: "",
    path: lang === "en" ? sitePath("") : sitePath("ru/"),
    title: lang === "en" ? "Pulsar documentation" : "Документация Pulsar",
    description:
      lang === "en"
        ? "Build native desktop and Android apps with a TypeScript UI and a Bun backend."
        : "Нативные приложения для десктопа и Android на TypeScript UI и Bun.",
    html: content,
    toc: [],
    text:
      lang === "en"
        ? "Pulsar TypeScript framework Bun desktop Android documentation"
        : "Pulsar TypeScript Bun десктоп Android документация",
    alt: lang === "en" ? sitePath("ru/") : sitePath(""),
    isHome: true,
  }
}

const markdownPage = (
  lang: Lang,
  slug: string,
  title: string,
  body: string,
  md: ReturnType<typeof makeMarkdown>,
  alt: string,
  note = "",
): Page => {
  const prefix = note ? `<p class="page-note">${escapeHTML(note)}</p>` : ""

  return {
    lang,
    slug,
    path: lang === "en" ? sitePath(`${slug}/`) : sitePath(`ru/${slug}/`),
    title,
    description: stripTags(body).slice(0, 180),
    html: prefix + md.render(body),
    toc: [],
    text: stripTags(body),
    alt,
  }
}

const icon = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  github:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.32 9.32 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/></svg>',
  brand:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.1" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4.8" transform="rotate(-18 12 12)" stroke="currentColor" stroke-width="1.1" opacity=".65"/></svg>',
}

const navLink = (page: Page, current: Page, label = page.navTitle ?? page.title): string => {
  const active = page.path === current.path

  return `<a class="nav-link" href="${page.path}"${active ? ' aria-current="page"' : ""}>${escapeHTML(label)}</a>`
}

const sidebar = (
  current: Page,
  home: Page,
  groups: Array<{ label: string; pages: Page[] }>,
  changelogPage: Page,
): string => {
  const t = ui[current.lang]

  const group = (label: string, pages: Page[]) => {
    return `<div class="nav-group"><p class="nav-title">${escapeHTML(label)}</p>${pages
      .map((page) => navLink(page, current))
      .join("")}</div>`
  }

  return `<aside class="sidebar" id="sidebar">
  <nav class="sidebar-nav" aria-label="${escapeHTML(t.docs)}">
    ${navLink(home, current, t.overview)}
    ${groups.map((item) => group(item.label, item.pages)).join("\n    ")}
    <div class="nav-group nav-group-end">
      ${navLink(changelogPage, current, t.changelog)}
    </div>
  </nav>
  <div class="sidebar-foot">
    <a class="lang-switch" href="${current.alt}" hreflang="${current.lang === "en" ? "ru" : "en"}" title="${escapeHTML(t.switchLanguage)}">${t.languageName}</a>
    <span class="sidebar-version">${escapeHTML(`v${VERSION}`)}</span>
  </div>
</aside>`
}

const toc = (current: Page): string => {
  if (current.toc.length === 0) return ""
  const t = ui[current.lang]

  return `<aside class="toc" aria-label="${escapeHTML(t.onThisPage)}">
  <p class="toc-title">${escapeHTML(t.onThisPage)}</p>
  <nav>
    ${current.toc
      .map((item) => `<a class="toc-link depth-${item.depth}" href="#${item.id}">${escapeHTML(item.title)}</a>`)
      .join("")}
  </nav>
</aside>`
}

const pager = (current: Page, order: Page[]): string => {
  const t = ui[current.lang]
  const index = order.indexOf(current)
  if (index < 0) return ""

  const prev = order[index - 1]
  const next = order[index + 1]

  const link = (page: Page | undefined, label: string, className: string) => {
    if (!page) return `<span></span>`
    return `<a class="pager-link ${className}" href="${page.path}"><span class="pager-label">${escapeHTML(label)}</span><span class="pager-title">${escapeHTML(page.title)}</span></a>`
  }

  return `<nav class="pager" aria-label="Pagination">${link(prev, t.previous, "pager-prev")}${link(next, t.next, "pager-next")}</nav>`
}

const shell = (current: Page, bodyClass: string, main: string, nav: string, tocHTML: string): string => {
  const t = ui[current.lang]
  const local = (path: string) => sitePath(`${current.lang === "en" ? "" : "ru/"}${path}`)
  const title = current.isHome ? current.title : `${current.title} — Pulsar`
  const canonical = DOMAIN ? `https://${DOMAIN}${current.path}` : ""
  const altLang = current.lang === "en" ? "ru" : "en"

  return `<!doctype html>
<html lang="${current.lang}" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <meta name="description" content="${escapeHTML(current.description)}">
  ${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
  <link rel="alternate" hreflang="${altLang}" href="${current.alt}">
  <link rel="icon" href="${sitePath("favicon.svg")}" type="image/svg+xml">
  <link rel="stylesheet" href="${sitePath("assets/styles.css")}?v=${BUILD_ID}">
  <script>
    (function () {
      try {
        var param = new URLSearchParams(location.search).get("theme")
        var stored = param === "light" || param === "dark" ? param : localStorage.getItem("pulsar-docs-theme")
        var theme = stored || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
        document.documentElement.dataset.theme = theme
      } catch (error) {}
    })()
  </script>
</head>
<body data-base="${BASE}" data-lang="${current.lang}" class="${bodyClass}">
  <a class="skip-link" href="#content">${escapeHTML(t.skip)}</a>
  <header class="topbar">
    <button class="icon-button nav-toggle" id="nav-toggle" aria-controls="sidebar" aria-expanded="false" aria-label="${escapeHTML(t.menu)}">${icon.menu}</button>
    <a class="brand" href="${local("")}"><span class="brand-mark">${icon.brand}</span><span>pulsar</span></a>
    <nav class="topnav" aria-label="${escapeHTML(t.docs)}">
      <a href="${local("quick-start/")}">${escapeHTML(t.docs)}</a>
      <a href="${local("guide/")}">${escapeHTML(t.guide)}</a>
      <a href="${local("changelog/")}">${escapeHTML(t.changelog)}</a>
    </nav>
    <div class="top-actions">
      <button class="search-button" id="search-open" aria-label="${escapeHTML(t.search)}">
        ${icon.search}
        <span class="search-label">${escapeHTML(t.search)}</span>
        <kbd>⌘K</kbd>
      </button>
      <div id="theme-root"></div>
      <a class="icon-button github-link" href="https://github.com/riclud/pulsar" rel="noopener" aria-label="GitHub">${icon.github}</a>
      <a class="lang-link" href="${current.alt}" hreflang="${altLang}" title="${escapeHTML(t.switchLanguage)}" aria-label="${escapeHTML(t.switchLanguage)}">${escapeHTML(t.languageShort)}</a>
    </div>
  </header>
  <div class="scrim" id="scrim"></div>
  <div class="shell ${current.toc.length ? "with-toc" : ""}">
    ${nav}
    <main class="main" id="content">
      ${main}
    </main>
    ${tocHTML}
  </div>
  <div id="search-root"></div>
  <script type="module" src="${sitePath("assets/app.js")}?v=${BUILD_ID}"></script>
</body>
</html>`
}

const pageMain = (current: Page, sections: Page[]): string => {
  const t = ui[current.lang]

  if (current.isHome) return current.html

  const editURL = `https://github.com/riclud/pulsar/edit/main/${
    current.sourcePath ?? (current.lang === "en" ? "docs/reference.md" : "docs/reference.ru.md")
  }`

  return `<article class="prose">
  <h1>${escapeHTML(current.title)}</h1>
  ${current.html}
  <p class="edit-link"><a href="${editURL}" rel="noopener">${escapeHTML(t.edit)}</a></p>
</article>
${pager(current, sections)}`
}

const sectionBodies = (html: string): Array<{ id: string; text: string }> => {
  const re = /<h([2-4]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g
  const matches: Array<{ id: string; start: number; end: number }> = []
  let match: RegExpExecArray | null

  while ((match = re.exec(html)) !== null) {
    matches.push({ id: match[2]!, start: match.index, end: re.lastIndex })
  }

  return matches.map((item, index) => {
    const next = matches[index + 1]
    return { id: item.id, text: stripTags(html.slice(item.end, next ? next.start : html.length)).slice(0, 600) }
  })
}

const searchEntries = (pages: Page[]) => {
  const entries: Array<{ lang: Lang; title: string; section: string; url: string; text: string }> = []

  for (const page of pages) {
    entries.push({ lang: page.lang, title: page.title, section: "", url: page.path, text: page.text })

    if (page.isHome) continue

    const bodies = sectionBodies(page.html)

    for (const item of page.toc) {
      entries.push({
        lang: page.lang,
        title: item.title,
        section: page.title,
        url: `${page.path}#${item.id}`,
        text: bodies.find((body) => body.id === item.id)?.text ?? "",
      })
    }
  }

  return entries
}

const build = async () => {
  const highlighter = await buildHighlighter()
  const md = makeMarkdown(highlighter)

  const enSections = pagesFor("en")
  const ruSections = pagesFor("ru")

  for (const [index, page] of enSections.entries()) {
    const other = ruSections[index]
    if (other) {
      page.alt = other.path
      other.alt = page.path
    }
  }

  for (const page of [...enSections, ...ruSections]) {
    page.html = md.render(page.source ?? "")
    page.text = stripTags(page.html)
    page.description = page.text.slice(0, 180)
  }

  const detailPage = (sections: Page[], file: string, title: string) => {
    const page = sections.find((item) => item.slug === "ui")
    if (!page) return

    page.title = title
    page.navTitle = title
    page.sourcePath = `docs/${file}`
    page.html = md.render(stripH1(readFileSync(join(ROOT, "docs", file), "utf8")))
    page.text = stripTags(page.html)
    page.description = page.text.slice(0, 180)
  }

  detailPage(enSections, "guide-ui.md", "UI building blocks")
  detailPage(ruSections, "guide-ui.ru.md", "UI-блоки")

  const changelogSource = stripH1(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"))

  const changelogEN = markdownPage("en", "changelog", ui.en.changelog, changelogSource, md, sitePath("ru/changelog/"))
  changelogEN.path = sitePath("changelog/")

  const changelogRU = markdownPage(
    "ru",
    "changelog",
    ui.ru.changelog,
    changelogSource,
    md,
    sitePath("changelog/"),
    ui.ru.changelogNote,
  )
  changelogRU.path = sitePath("ru/changelog/")

  const protocolSource = stripH1(readFileSync(join(ROOT, "docs/protocol.md"), "utf8"))

  const protocolEN = markdownPage(
    "en",
    "protocol-internals",
    ui.en.protocol,
    protocolSource,
    md,
    sitePath("ru/protocol-internals/"),
  )
  protocolEN.path = sitePath("protocol-internals/")

  const protocolRU = markdownPage(
    "ru",
    "protocol-internals",
    ui.ru.protocol,
    protocolSource,
    md,
    sitePath("protocol-internals/"),
    ui.ru.protocolNote,
  )
  protocolRU.path = sitePath("ru/protocol-internals/")

  const guideSource = (lang: Lang, file: string, title: string, slug: string): Page => {
    const page = markdownPage(lang, slug, title, stripH1(readFileSync(join(ROOT, "docs", file), "utf8")), md, "")

    page.sourcePath = `docs/${file}`

    return page
  }

  const guideEN = [
    guideSource("en", "guide-web.md", "Coming from the web", "guide/web"),
    guideSource("en", "guide.md", "Build an app", "guide"),
    guideSource("en", "guide-components.md", "Components and signals", "guide/components"),
    guideSource("en", "guide-api.md", "API tour", "guide/api"),
  ]
  const guideRU = [
    guideSource("ru", "guide-web.ru.md", "Если вы пришли из веба", "guide/web"),
    guideSource("ru", "guide.ru.md", "Соберите приложение", "guide"),
    guideSource("ru", "guide-components.ru.md", "Компоненты и сигналы", "guide/components"),
    guideSource("ru", "guide-api.ru.md", "Тур по API", "guide/api"),
  ]

  for (const [index, page] of guideEN.entries()) {
    const other = guideRU[index]
    if (other) {
      page.alt = other.path
      other.alt = page.path
    }
  }

  const enPages = [homePage("en", md), ...guideEN, ...enSections, protocolEN, changelogEN]
  const ruPages = [homePage("ru", md), ...guideRU, ...ruSections, protocolRU, changelogRU]

  const groupsFor = (lang: Lang, pages: Page[]) => {
    const bySlug = new Map(pages.map((page) => [page.slug, page]))

    return navGroups[lang].map((group) => ({
      label: group.label,
      pages: group.slugs.map((slug) => bySlug.get(slug)).filter((page): page is Page => page !== undefined),
    }))
  }

  const enGroups = groupsFor("en", enPages)
  const ruGroups = groupsFor("ru", ruPages)

  const enAnchors = new Map<string, { page: Page; id: string }>()
  const ruAnchors = new Map<string, { page: Page; id: string }>()

  for (const page of enPages) {
    page.toc = extractToc(page.html)
    extractAnchors(page.html, page, enAnchors)
  }

  for (const page of ruPages) {
    page.toc = extractToc(page.html)
    extractAnchors(page.html, page, ruAnchors)
  }

  for (const page of enPages) page.html = rewriteLinks(page.html, page, enAnchors)
  for (const page of ruPages) page.html = rewriteLinks(page.html, page, ruAnchors)

  const allPages = [...enPages, ...ruPages]

  for (const page of allPages) {
    if (page.isHome) continue

    page.text = stripTags(page.html)
    page.description = page.text.slice(0, 180)
  }

  rmSync(DIST, { recursive: true, force: true })
  mkdirSync(join(DIST, "assets"), { recursive: true })

  cpSync(PUBLIC, DIST, { recursive: true })

  for (const page of [changelogEN, changelogRU]) page.toc = page.toc.filter((item) => item.depth === 2)

  for (const page of allPages) {
    const dir =
      page.slug === ""
        ? page.lang === "en"
          ? DIST
          : join(DIST, "ru")
        : join(DIST, page.lang === "en" ? "" : "ru", page.slug)
    mkdirSync(dir, { recursive: true })

    const siblings = page.lang === "en" ? enPages : ruPages
    const main = pageMain(page, siblings)
    const nav = sidebar(
      page,
      siblings[0]!,
      page.lang === "en" ? enGroups : ruGroups,
      page.lang === "en" ? changelogEN : changelogRU,
    )
    const tocHTML = toc(page)
    const html = shell(page, page.isHome ? "is-home" : "is-doc", main, nav, tocHTML)

    writeFileSync(join(dir, "index.html"), html)
  }

  const redirect = (dir: string, target: string, lang: Lang) => {
    const canonical = DOMAIN ? `https://${DOMAIN}${target}` : target
    const label = lang === "en" ? "Redirecting to the UI guide…" : "Переход к документации UI…"

    mkdirSync(join(DIST, dir), { recursive: true })
    writeFileSync(
      join(DIST, dir, "index.html"),
      `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0; url=${target}">
  <link rel="canonical" href="${canonical}">
  <title>${label}</title>
  <script>location.replace(${JSON.stringify(target)})</script>
</head>
<body><a href="${target}">${label}</a></body>
</html>
`,
    )
  }

  redirect("guide/ui", sitePath("ui/"), "en")
  redirect("ru/guide/ui", sitePath("ru/ui/"), "ru")

  writeFileSync(join(DIST, "search-index.json"), JSON.stringify(searchEntries(allPages)))

  const css = readFileSync(join(SRC, "styles.css"), "utf8")
  writeFileSync(join(DIST, "assets", "styles.css"), css)

  const result = await Bun.build({
    entrypoints: [join(SRC, "app.ts")],
    outdir: join(DIST, "assets"),
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    naming: "[name].[ext]",
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error("client bundle failed")
  }

  if (DOMAIN) {
    writeFileSync(join(DIST, "CNAME"), `${DOMAIN}\n`)

    const urls = allPages.map((page) => `  <url><loc>https://${DOMAIN}${page.path}</loc></url>`).join("\n")

    writeFileSync(
      join(DIST, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    )
  }

  console.log(`built ${allPages.length} pages → ${DIST}`)

  return { allPages }
}

const serve = async () => {
  await build()
  const port = Number(process.env.PORT ?? 4173)

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)

      if (BASE && pathname.startsWith(BASE)) pathname = pathname.slice(BASE.length)
      if (BASE && pathname === "/") return Response.redirect(`${BASE}/`, 302)

      let filePath = join(DIST, pathname)
      if (pathname.endsWith("/")) filePath = join(filePath, "index.html")
      if (!existsSync(filePath)) filePath = join(DIST, "index.html")

      return new Response(Bun.file(filePath))
    },
  })

  console.log(`docs preview: http://localhost:${server.port}${BASE}/`)
}

if (process.argv.includes("--serve")) {
  await serve()
} else {
  await build()
}
