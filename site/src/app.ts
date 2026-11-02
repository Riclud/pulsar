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
  } catch (error) {}

  renderTheme()
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

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    await copyText(button.dataset.copy ?? "")

    const label = button.textContent
    button.textContent = strings.copied
    window.setTimeout(() => {
      button.textContent = label
    }, 1400)
  })
})

document.querySelectorAll<HTMLElement>(".prose pre").forEach((pre) => {
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

const headings = Array.from(document.querySelectorAll<HTMLElement>(".prose h2[id], .prose h3[id], .prose h4[id]"))
const tocLinks = new Map(
  Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc-link")).map((link) => [
    link.getAttribute("href")?.slice(1) ?? "",
    link,
  ]),
)

if (headings.length > 0 && tocLinks.size > 0) {
  let ticking = false

  const updateToc = () => {
    ticking = false
    let current: HTMLElement | null = null

    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 120) current = heading
    }

    for (const [id, link] of tocLinks) link.classList.toggle("active", id === current?.id)
  }

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(updateToc)
    },
    { passive: true },
  )

  updateToc()
}

window.addEventListener(
  "scroll",
  () => {
    document.querySelector(".topbar")?.classList.toggle("scrolled", window.scrollY > 4)
  },
  { passive: true },
)
