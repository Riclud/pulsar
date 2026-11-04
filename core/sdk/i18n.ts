export type PluralForms = {
  one?: string
  few?: string
  many?: string
  other: string
}

type Messages = Record<string, string>

let locale = "en"
let messages: Messages = {}

export const setLocale = (value: string): void => {
  locale = value || "en"
}

export const getLocale = (): string => {
  return locale
}

export const setMessages = (value: Messages): void => {
  messages = { ...value }
}

export const getMessages = (): Messages => {
  return { ...messages }
}

export const translate = (key: string, fallback?: string): string => {
  return messages[key] ?? fallback ?? key
}

export const interpolate = (
  template: string,
  params: Record<string, string | number> = {},
): string => {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]

    return value === undefined ? match : String(value)
  })
}

const isRTL = (value: string): boolean => {
  return /^(ar|fa|he|ur|yi|ps|sd|ug|dv)\b/i.test(value)
}

export const direction = (value = locale): "ltr" | "rtl" => {
  return isRTL(value) ? "rtl" : "ltr"
}

const pluralCategory = (count: number, value: string): keyof PluralForms => {
  try {
    const rules = new Intl.PluralRules(value)
    const category = rules.select(count)

    if (category === "one" || category === "few" || category === "many") return category
  } catch {}

  return count === 1 ? "one" : "other"
}

export const plural = (
  count: number,
  forms: PluralForms,
  params: Record<string, string | number> = {},
): string => {
  const category = pluralCategory(count, locale)
  const template = forms[category] ?? forms.other

  return interpolate(template, { ...params, count })
}

export const t = (
  key: string,
  params: Record<string, string | number> = {},
  fallback?: string,
): string => {
  return interpolate(translate(key, fallback), params)
}
