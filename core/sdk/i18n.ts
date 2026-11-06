import { signal } from "./reactive.ts"
export type PluralForms = {
  one?: string
  few?: string
  many?: string
  other: string
}

type Messages = Record<string, string>

const locale = signal("en")
const messages = signal<Messages>({})

export const setLocale = (value: string): void => {
  locale.set(value || "en")
}

export const getLocale = (): string => {
  return locale.get()
}

export const setMessages = (value: Messages): void => {
  messages.set({ ...value })
}

export const getMessages = (): Messages => {
  return { ...messages.get() }
}

export const translate = (key: string, fallback?: string): string => {
  return messages.get()[key] ?? fallback ?? key
}

export const interpolate = (template: string, params: Record<string, string | number> = {}): string => {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]

    return value === undefined ? match : String(value)
  })
}

const isRTL = (value: string): boolean => {
  return /^(ar|fa|he|ur|yi|ps|sd|ug|dv)\b/i.test(value)
}

export const direction = (value = locale.get()): "ltr" | "rtl" => {
  return isRTL(value) ? "rtl" : "ltr"
}

const pluralCategory = (count: number, value: string): keyof PluralForms => {
  try {
    const rules = new Intl.PluralRules(value)
    const category = rules.select(count)

    if (category === "one" || category === "few" || category === "many") return category
  } catch {
    // Intl.PluralRules may be missing on some engines; fall back to the simple rule below.
  }

  return count === 1 ? "one" : "other"
}

export const plural = (count: number, forms: PluralForms, params: Record<string, string | number> = {}): string => {
  const category = pluralCategory(count, locale.get())
  const template = forms[category] ?? forms.other

  return interpolate(template, { ...params, count })
}

export const t = (key: string, params: Record<string, string | number> = {}, fallback?: string): string => {
  return interpolate(translate(key, fallback), params)
}
