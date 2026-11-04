export type ValidationResult = string | null

export type ValidationRule = (value: string) => ValidationResult

export const required = (message = "Required"): ValidationRule => {
  return (value) => (value.trim().length > 0 ? null : message)
}

export const minLength = (length: number, message?: string): ValidationRule => {
  return (value) => (value.length >= length ? null : message ?? `At least ${length} characters`)
}

export const maxLength = (length: number, message?: string): ValidationRule => {
  return (value) => (value.length <= length ? null : message ?? `At most ${length} characters`)
}

export const pattern = (expression: RegExp, message = "Invalid value"): ValidationRule => {
  return (value) => (expression.test(value) ? null : message)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const email = (message = "Invalid email"): ValidationRule => {
  return (value) => (value.length === 0 || EMAIL.test(value) ? null : message)
}

export const number = (message = "Must be a number"): ValidationRule => {
  return (value) => (value.trim().length === 0 || Number.isFinite(Number(value)) ? null : message)
}

export const min = (limit: number, message?: string): ValidationRule => {
  return (value) => (Number(value) >= limit ? null : message ?? `Must be at least ${limit}`)
}

export const max = (limit: number, message?: string): ValidationRule => {
  return (value) => (Number(value) <= limit ? null : message ?? `Must be at most ${limit}`)
}

export const validate = (value: string, rules: ValidationRule[]): ValidationResult => {
  for (const rule of rules) {
    const error = rule(value)

    if (error) return error
  }

  return null
}

export const isValid = (value: string, rules: ValidationRule[]): boolean => {
  return validate(value, rules) === null
}
