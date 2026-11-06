import { html, nothing, render } from "lit-html"

interface SearchEntry {
  lang: "en" | "ru"
  title: string
  section: string
  url: string
  text: string
}

type Theme = "dark" | "light"

const root = document.documentElement
const body = document.body
const base = body.dataset.base ?? ""
const lang = body.dataset.lang === "ru" ? "ru" : "en"

const strings = {
  en: {
    search: "Search",
    searchHint: "Search the docs",
    searchEmpty: "Type to search documentation.",
    noResults: "No results.",
    dark: "Switch to light theme",
    light: "Switch to dark theme",
    copy: "Copy",
    copied: "Copied",
  },
  ru: {
    search: "Поиск",
    searchHint: "Поиск по документации",
    searchEmpty: "Начните печатать, чтобы искать.",
    noResults: "Ничего не найдено.",
    dark: "Светлая тема",
    light: "Тёмная тема",
    copy: "Копировать",
    copied: "Скопировано",
  },
}[lang]

const path = (value: string): string => {
  return `${base}/${value.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/")
}

const sunIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="4" />
  <path
    d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"
  />
</svg>`

const moonIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
</svg>`

const searchIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  aria-hidden="true"
>
  <circle cx="11" cy="11" r="6.5" />
  <path d="m16 16 4 4" />
</svg>`

const currentTheme = (): Theme => {
  return root.dataset.theme === "light" ? "light" : "dark"
}

const themeRoot = document.querySelector<HTMLElement>("#theme-root")

const renderTheme = () => {
  if (!themeRoot) return

  const theme = currentTheme()
  const label = theme === "dark" ? strings.dark : strings.light

  render(
    html`<button class="icon-button" id="theme-toggle" aria-label=${label} title=${label} @click=${toggleTheme}>
      ${theme === "dark" ? sunIcon : moonIcon}
    </button>`,
    themeRoot,
  )
}

const toggleTheme = () => {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark"

  root.dataset.theme = next

  try {
    localStorage.setItem("pulsar-docs-theme", next)
  } catch {
    // Storage can be blocked; the theme still applies for this visit.
  }

  renderTheme()
  initStarfield()
}

renderTheme()

const navToggle = document.querySelector<HTMLButtonElement>("#nav-toggle")
const scrim = document.querySelector<HTMLElement>("#scrim")

const setNav = (open: boolean) => {
  body.classList.toggle("nav-open", open)
  navToggle?.setAttribute("aria-expanded", String(open))
}

navToggle?.addEventListener("click", () => setNav(!body.classList.contains("nav-open")))
scrim?.addEventListener("click", () => setNav(false))

const searchRoot = document.querySelector<HTMLElement>("#search-root")

let entries: SearchEntry[] | null = null
let loading = false
let searchOpen = false
let query = ""
let active = 0
let focusInput = false

const loadIndex = async () => {
  if (entries || loading) return
  loading = true

  try {
    const response = await fetch(path("search-index.json"))

    entries = (await response.json()) as SearchEntry[]
  } catch (error) {
    entries = []
  } finally {
    loading = false
    renderSearch()
  }
}

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const highlight = (text: string) => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  if (terms.length === 0) return text

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi")
  const parts = text.split(pattern)

  return parts.map((part, index) => (index % 2 === 1 ? html`<mark>${part}</mark>` : part))
}

const snippet = (text: string): string => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  let index = -1

  for (const term of terms) {
    const found = lower.indexOf(term)

    if (found >= 0 && (index < 0 || found < index)) index = found
  }

  if (index < 0) return text.slice(0, 180)

  let start = Math.max(0, index - 50)
  let end = Math.min(text.length, start + 190)

  if (start > 0) {
    const space = text.indexOf(" ", start)

    if (space >= 0 && space < index) start = space + 1
  }

  if (end < text.length) {
    const space = text.lastIndexOf(" ", end)

    if (space > index) end = space
  }

  return `${start > 0 ? "… " : ""}${text.slice(start, end).trim()}${end < text.length ? " …" : ""}`
}

const results = () => {
  if (!entries) return []
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  if (terms.length === 0) return []

  return entries
    .filter((entry) => entry.lang === lang)
    .map((entry) => {
      const title = entry.title.toLowerCase()
      const section = entry.section.toLowerCase()
      const text = entry.text.toLowerCase()
      let score = 0

      for (const term of terms) {
        const inTitle = title.includes(term)
        const inSection = section.includes(term)
        const inText = text.includes(term)

        if (!inTitle && !inSection && !inText) return null
        if (inTitle) score += 8
        if (section.includes(term)) score += 3
        if (inText) score += 1
      }

      return { entry, score }
    })
    .filter((item): item is { entry: SearchEntry; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map((item) => item.entry)
}

const openSearch = () => {
  searchOpen = true
  query = ""
  active = 0
  focusInput = true
  body.classList.add("search-open")
  setNav(false)
  renderSearch()
  void loadIndex()
}

const closeSearch = () => {
  searchOpen = false
  query = ""
  body.classList.remove("search-open")
  renderSearch()
}

const go = (url: string) => {
  window.location.href = url
}

const onSearchInput = (event: Event) => {
  query = (event.target as HTMLInputElement).value
  active = 0
  renderSearch()
}

const onSearchKey = (event: KeyboardEvent) => {
  const list = results()

  if (event.key === "ArrowDown") {
    event.preventDefault()
    active = Math.min(active + 1, list.length - 1)
    renderSearch()

    return
  }

  if (event.key === "ArrowUp") {
    event.preventDefault()
    active = Math.max(active - 1, 0)
    renderSearch()

    return
  }

  if (event.key === "Enter" && list[active]) {
    event.preventDefault()
    go(list[active]!.url)
  }
}

const renderSearch = () => {
  if (!searchRoot) return

  if (!searchOpen) {
    render(nothing, searchRoot)

    return
  }

  const list = results()
  const showEmpty = query.trim().length > 0 && list.length === 0

  render(
    html`<div class="search-overlay" @click=${closeSearch}>
      <div
        class="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label=${strings.search}
        @click=${(event: Event) => event.stopPropagation()}
      >
        <div class="search-field">
          ${searchIcon}
          <input
            id="search-input"
            type="search"
            placeholder=${strings.searchHint}
            autocomplete="off"
            spellcheck="false"
            aria-label=${strings.search}
            @input=${onSearchInput}
            @keydown=${onSearchKey}
          />
          <kbd>Esc</kbd>
        </div>
        <div class="search-results" role="listbox">
          ${
            query.trim().length === 0
              ? html`<p class="search-hint">${strings.searchEmpty}</p>`
              : showEmpty
                ? html`<p class="search-hint">${strings.noResults}</p>`
                : list.map(
                    (entry, index) =>
                      html`<a
                        class="search-hit"
                        href=${entry.url}
                        role="option"
                        aria-selected=${index === active}
                        @mouseenter=${() => {
                          active = index
                          renderSearch()
                        }}
                      >
                        ${entry.section ? html`<span class="search-hit-section">${highlight(entry.section)}</span>` : nothing}
                        <span class="search-hit-title">${highlight(entry.title)}</span>
                        ${entry.text ? html`<span class="search-hit-text">${highlight(snippet(entry.text))}</span>` : nothing}
                      </a>`,
                  )
          }
        </div>
        <div class="search-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span>
        </div>
      </div>
    </div>`,
    searchRoot,
  )

  if (focusInput) {
    focusInput = false
    const input = document.querySelector<HTMLInputElement>("#search-input")

    input?.focus()
  }

  const selected = searchRoot.querySelector<HTMLElement>(".search-hit[aria-selected='true']")

  selected?.scrollIntoView({ block: "nearest" })
}

document.querySelector("#search-open")?.addEventListener("click", openSearch)

if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
  document.querySelectorAll<HTMLElement>(".search-button kbd").forEach((kbd) => {
    kbd.textContent = "Ctrl K"
  })
}

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null
  const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault()
    if (searchOpen) closeSearch()
    else openSearch()

    return
  }

  if (event.key === "Escape") {
    if (searchOpen) closeSearch()
    else if (body.classList.contains("nav-open")) setNav(false)

    return
  }

  if (!typing && event.key === "/") {
    event.preventDefault()
    openSearch()
  }
})

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    const area = document.createElement("textarea")

    area.value = text
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    document.execCommand("copy")
    area.remove()
  }
}

let stopStarfield: (() => void) | null = null

const initPulsar = () => {
  stopStarfield?.()

  const canvas = document.querySelector<HTMLCanvasElement>("canvas.pulsar-canvas")
  const context = canvas?.getContext("2d")

  if (!canvas || !context) return

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const stars = Array.from({ length: 70 }, () => ({
    angle: Math.random() * Math.PI * 2,
    distance: 0.12 + Math.random() * 0.86,
    size: 0.4 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
  }))

  let size = 0
  let frame = 0

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    size = Math.max(1, rect.width)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const beam = (angle: number, radius: number, rgb: string) => {
    const spread = 0.13
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius)

    gradient.addColorStop(0, `rgba(${rgb}, 0.55)`)
    gradient.addColorStop(0.35, `rgba(${rgb}, 0.16)`)
    gradient.addColorStop(1, `rgba(${rgb}, 0)`)

    context.fillStyle = gradient
    context.beginPath()
    context.moveTo(0, 0)
    context.arc(0, 0, radius, angle - spread, angle + spread)
    context.closePath()
    context.fill()
  }

  const draw = (time: number) => {
    const light = document.documentElement.dataset.theme === "light"
    const primary = light ? "69, 86, 232" : "127, 146, 255"
    const secondary = light ? "10, 147, 184" : "95, 227, 255"
    const star = light ? "24, 30, 80" : "230, 235, 255"
    const starAlpha = light ? 0.9 : 0.5
    const starScale = light ? 1.35 : 1
    const center = size / 2
    const radius = size / 2
    const seconds = time / 1000
    const spin = seconds * 0.5

    context.clearRect(0, 0, size, size)

    for (const item of stars) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(seconds * 0.7 + item.phase))
      const x = center + Math.cos(item.angle + seconds * 0.012) * item.distance * radius
      const y = center + Math.sin(item.angle + seconds * 0.012) * item.distance * radius

      context.fillStyle = `rgba(${star}, ${starAlpha * twinkle})`
      context.beginPath()
      context.arc(x, y, item.size * starScale, 0, Math.PI * 2)
      context.fill()
    }

    for (let ring = 0; ring < 3; ring++) {
      const progress = (seconds / 3.6 + ring / 3) % 1

      context.strokeStyle = `rgba(${primary}, ${0.32 * (1 - progress) ** 2})`
      context.lineWidth = 1.2
      context.beginPath()
      context.arc(center, center, radius * (0.08 + progress * 0.9), 0, Math.PI * 2)
      context.stroke()
    }

    context.save()
    context.translate(center, center)
    context.rotate(-0.42)
    context.scale(1, 0.92)
    beam(spin, radius, primary)
    beam(spin + Math.PI, radius, secondary)
    context.restore()

    const pulse = 0.82 + 0.18 * Math.sin(seconds * 5)
    const glow = context.createRadialGradient(center, center, 0, center, center, radius * 0.24 * pulse)

    glow.addColorStop(0, `rgba(${light ? primary : "255, 255, 255"}, 0.95)`)
    glow.addColorStop(0.13, `rgba(${secondary}, 0.7)`)
    glow.addColorStop(0.42, `rgba(${primary}, 0.2)`)
    glow.addColorStop(1, `rgba(${primary}, 0)`)

    context.fillStyle = glow
    context.beginPath()
    context.arc(center, center, radius * 0.24, 0, Math.PI * 2)
    context.fill()
  }

  const pace = reduced ? 0.25 : 1

  const loop = (time: number) => {
    draw(time * pace)
    frame = requestAnimationFrame(loop)
  }

  const observer = new ResizeObserver(resize)

  observer.observe(canvas)
  resize()

  frame = requestAnimationFrame(loop)

  stopStarfield = () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    stopStarfield = null
  }
}

const JUSTIFY_CSS: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
}

const ALIGN_CSS: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
}

const initPlayground = () => {
  const root = document.querySelector<HTMLElement>("[data-playground]")
  const row = root?.querySelector<HTMLElement>(".play-row")
  const code = root?.querySelector<HTMLElement>(".play-code code")

  if (!root || !row || !code) return

  let justify = "between"
  let align = "center"

  const paint = () => {
    row.style.justifyContent = JUSTIFY_CSS[justify] ?? "flex-start"
    row.style.alignItems = ALIGN_CSS[align] ?? "center"
    code.textContent = `Row({ fillWidth: true, justify: "${justify}", alignItems: "${align}" }, ...)`

    for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
      const active = button.dataset.justify === justify || button.dataset.align === align

      button.setAttribute("aria-pressed", String(active))
    }
  }

  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button")

    if (!button) return

    justify = button.dataset.justify ?? justify
    align = button.dataset.align ?? align
    paint()
  })

  paint()
}

const initSignalsDemo = () => {
  const root = document.querySelector<HTMLElement>("[data-signals]")

  if (!root) return

  const counts = [1, 1, 1]
  const reads: Record<string, number[]> = { "0": [0], "1": [1], "2": [0, 2] }

  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-trigger]")

    if (!button) return

    for (const index of reads[button.dataset.trigger ?? ""] ?? []) {
      const card = root.querySelector<HTMLElement>(`[data-card="${index}"]`)
      const value = card?.querySelector("b")

      if (!card || !value) continue

      counts[index] = (counts[index] ?? 0) + 1
      value.textContent = String(counts[index])
      card.classList.add("is-hit")
      setTimeout(() => card.classList.remove("is-hit"), 180)
    }
  })
}

const initStarfield = () => {
  initPulsar()
  initPlayground()
  initSignalsDemo()
}

const initCopyButtons = (root: ParentNode = document) => {
  root.querySelectorAll<HTMLElement>("[data-sample]").forEach((sample) => {
    if (sample.dataset.bound === "1") return
    sample.dataset.bound = "1"

    const tabs = sample.querySelectorAll<HTMLButtonElement>("[data-sample-tab]")

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((other) => {
          const active = other === tab

          other.classList.toggle("is-active", active)
          other.setAttribute("aria-selected", String(active))
        })

        sample.querySelectorAll<HTMLElement>("[data-sample-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.samplePanel !== tab.dataset.sampleTab
        })
      })
    })
  })

  root.querySelectorAll<HTMLElement>("[data-install]").forEach((install) => {
    if (install.dataset.bound === "1") return
    install.dataset.bound = "1"

    const tabs = install.querySelectorAll<HTMLButtonElement>("[data-install-tab]")
    const copy = install.querySelector<HTMLButtonElement>("[data-copy]")

    const select = (id: string) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.installTab === id

        tab.classList.toggle("is-active", active)
        tab.setAttribute("aria-selected", String(active))
      })

      install.querySelectorAll<HTMLElement>("[data-install-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.installPanel !== id

        if (!panel.hidden && copy) copy.dataset.copy = panel.textContent?.trim() ?? ""
      })
    }

    tabs.forEach((tab) => tab.addEventListener("click", () => select(tab.dataset.installTab ?? "unix")))

    if (/Windows/i.test(navigator.userAgent)) select("windows")
  })

  root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    if (button.dataset.bound === "1") return
    button.dataset.bound = "1"

    button.addEventListener("click", async () => {
      await copyText(button.dataset.copy ?? "")

      const label = button.textContent

      button.textContent = strings.copied
      window.setTimeout(() => {
        button.textContent = label
      }, 1400)
    })
  })

  root.querySelectorAll<HTMLElement>(".prose pre").forEach((pre) => {
    if (pre.querySelector(".code-copy")) return

    const button = document.createElement("button")

    button.className = "code-copy"
    button.type = "button"
    button.textContent = strings.copy

    button.addEventListener("click", async () => {
      await copyText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "")
      button.textContent = strings.copied
      window.setTimeout(() => {
        button.textContent = strings.copy
      }, 1400)
    })

    pre.appendChild(button)
  })
}

initCopyButtons()

let tocHandler: (() => void) | null = null

const setupToc = () => {
  if (tocHandler) {
    window.removeEventListener("scroll", tocHandler)
    tocHandler = null
  }

  const headings = Array.from(document.querySelectorAll<HTMLElement>(".prose h2[id], .prose h3[id], .prose h4[id]"))
  const tocLinks = new Map(
    Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc-link")).map((link) => [
      link.getAttribute("href")?.slice(1) ?? "",
      link,
    ]),
  )

  if (headings.length === 0 || tocLinks.size === 0) return

  let ticking = false

  const updateToc = () => {
    ticking = false
    let current: HTMLElement | null = null

    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 120) current = heading
    }

    for (const [id, link] of tocLinks) link.classList.toggle("active", id === current?.id)
  }

  tocHandler = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(updateToc)
  }

  window.addEventListener("scroll", tocHandler, { passive: true })
  updateToc()
}

setupToc()
initStarfield()

const pageCache = new Map<string, string>()

const isPageURL = (url: URL): boolean => {
  return !/\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|tar|sh|ps1|txt|json|xml|woff2?|ttf)$/i.test(url.pathname)
}

const prefetch = (url: URL) => {
  if (pageCache.has(url.href)) return

  void fetch(url.href, { headers: { Accept: "text/html" } })
    .then((response) => (response.ok ? response.text() : null))
    .then((html) => {
      if (!html) return
      if (pageCache.size >= 20) pageCache.delete(pageCache.keys().next().value ?? "")
      pageCache.set(url.href, html)
    })
    .catch(() => {})
}

const parsePage = (html: string): Document => {
  return new DOMParser().parseFromString(html, "text/html")
}

const copyHead = (next: Document) => {
  const description = next.querySelector('meta[name="description"]')?.getAttribute("content")

  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", description ?? "")
  document.title = next.title

  const currentCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  const nextCanonical = next.querySelector<HTMLLinkElement>('link[rel="canonical"]')

  if (nextCanonical) {
    if (currentCanonical) currentCanonical.href = nextCanonical.href
    else document.head.appendChild(document.importNode(nextCanonical, true))
  } else {
    currentCanonical?.remove()
  }

  const currentAlternate = document.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang]')
  const nextAlternate = next.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang]')

  if (currentAlternate && nextAlternate) {
    currentAlternate.href = nextAlternate.href
    currentAlternate.setAttribute("hreflang", nextAlternate.getAttribute("hreflang") ?? "")
  }
}

const swapPage = (next: Document) => {
  closeSearch()
  setNav(false)

  document.documentElement.lang = next.documentElement.lang
  copyHead(next)

  document.body.classList.toggle("is-home", next.body.classList.contains("is-home"))
  document.body.classList.toggle("is-doc", next.body.classList.contains("is-doc"))

  const nextShell = next.querySelector(".shell")
  const currentShell = document.querySelector(".shell")

  if (nextShell && currentShell) currentShell.replaceWith(document.importNode(nextShell, true))

  const nextLang = next.querySelector<HTMLAnchorElement>(".lang-link")
  const currentLang = document.querySelector<HTMLAnchorElement>(".lang-link")

  if (nextLang && currentLang) {
    currentLang.href = nextLang.href
    currentLang.textContent = nextLang.textContent
    currentLang.setAttribute("hreflang", nextLang.getAttribute("hreflang") ?? "")
  }

  initCopyButtons()
  setupToc()
  initStarfield()
}

const scrollToTarget = (hash: string, fallback: number) => {
  const id = decodeURIComponent(hash.replace(/^#/, ""))

  requestAnimationFrame(() => {
    const previous = document.documentElement.style.scrollBehavior

    document.documentElement.style.scrollBehavior = "auto"

    if (id) {
      const target = document.getElementById(id)

      if (target) {
        target.scrollIntoView()
        document.documentElement.style.scrollBehavior = previous

        return
      }
    }

    window.scrollTo(0, fallback)
    document.documentElement.style.scrollBehavior = previous
  })
}

const navigate = async (url: URL, options: { push?: boolean; scrollY?: number } = {}) => {
  const push = options.push ?? true

  let html = pageCache.get(url.href)

  if (!html) {
    const response = await fetch(url.href, { headers: { Accept: "text/html" } })

    if (!response.ok) throw new Error(`navigation failed: ${response.status}`)
    html = await response.text()
  }

  const next = parsePage(html)

  if (!next.querySelector(".shell")) {
    window.location.assign(url.href)

    return
  }

  const update = () => swapPage(next)

  if (push) {
    history.replaceState({ ...history.state, scrollY: window.scrollY }, "", location.href)
    history.pushState({ scrollY: 0 }, "", url.href)
  }

  update()

  scrollToTarget(url.hash, push ? 0 : (options.scrollY ?? 0))
}

const isInternalPageLink = (anchor: HTMLAnchorElement, event: MouseEvent): boolean => {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (anchor.hasAttribute("download") || anchor.hasAttribute("hreflang")) return false
  if (anchor.target && anchor.target !== "_self") return false

  const url = new URL(anchor.href, location.href)

  if (url.origin !== location.origin) return false
  if (!isPageURL(url)) return false
  if (url.pathname === location.pathname && url.search === location.search) return false

  return true
}

document.addEventListener("click", (event) => {
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]")

  if (!anchor || !isInternalPageLink(anchor, event)) return

  const url = new URL(anchor.href, location.href)

  event.preventDefault()
  void navigate(url).catch(() => window.location.assign(url.href))
})

document.addEventListener("pointerover", (event) => {
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]")

  if (!anchor) return

  const url = new URL(anchor.href, location.href)

  if (url.pathname === location.pathname && url.search === location.search) return
  if (url.origin === location.origin && isPageURL(url) && url.href !== location.href) prefetch(url)
})

document.addEventListener("focusin", (event) => {
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]")

  if (!anchor) return

  const url = new URL(anchor.href, location.href)

  if (url.pathname === location.pathname && url.search === location.search) return
  if (url.origin === location.origin && isPageURL(url) && url.href !== location.href) prefetch(url)
})

window.addEventListener("popstate", (event) => {
  const state = event.state as { scrollY?: number } | null

  void navigate(new URL(location.href), { push: false, scrollY: state?.scrollY ?? 0 }).catch(() =>
    window.location.reload(),
  )
})

history.scrollRestoration = "manual"

window.addEventListener(
  "scroll",
  () => {
    document.querySelector(".topbar")?.classList.toggle("scrolled", window.scrollY > 4)
  },
  { passive: true },
)
