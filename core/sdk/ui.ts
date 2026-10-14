export type UiNodeType =
  | "column"
  | "row"
  | "box"
  | "text"
  | "button"
  | "textInput"
  | "checkbox"
  | "switch"
  | "slider"
  | "image"
  | "spacer"
  | "divider"

export interface UiNode {
  id: number
  type: UiNodeType
  props: Record<string, unknown>
  children?: UiNode[]
  events?: string[]
}

interface CommonOptions {
  width?: number
  height?: number
  visible?: boolean
  opacity?: number
}

export interface LayoutOptions extends CommonOptions {
  gap?: number
  padding?: number
  expand?: boolean
}

export interface BoxOptions extends CommonOptions {
  color?: string
  radius?: number
  padding?: number
  expand?: boolean
}

export interface TextOptions extends CommonOptions {
  text?: string
  color?: string
  size?: number
  bold?: boolean
  wrap?: boolean
  expand?: boolean
}

export interface ImageOptions extends CommonOptions {
  src: string
  fillMode?: string
}

export interface ButtonOptions extends CommonOptions {
  expand?: boolean
  enabled?: boolean
  onClick?: () => void
}

export interface TextInputOptions extends CommonOptions {
  value?: string
  placeholder?: string
  expand?: boolean
  onInput?: (value: string) => void
}

export interface CheckboxOptions extends CommonOptions {
  checked?: boolean
  onToggle?: (checked: boolean) => void
}

export interface SliderOptions extends CommonOptions {
  value?: number
  min?: number
  max?: number
  expand?: boolean
  onChange?: (value: number) => void
}

type UiHandler = (value: unknown) => void

const handlers = new Map<number, Record<string, UiHandler>>()
let nextId = 1

const makeNode = <P extends object>(
  type: UiNodeType,
  props: P,
  children: UiNode[] = [],
  events: string[] = [],
  callbacks?: Record<string, UiHandler>,
): UiNode => {
  const id = nextId++
  if (callbacks) handlers.set(id, callbacks)

  const node: UiNode = { id, type, props: props as Record<string, unknown> }
  if (children.length > 0) node.children = children
  if (events.length > 0) node.events = events

  return node
}

export const column = (options: LayoutOptions = {}, children: UiNode[] = []): UiNode => {
  return makeNode("column", options, children)
}

export const row = (options: LayoutOptions = {}, children: UiNode[] = []): UiNode => {
  return makeNode("row", options, children)
}

export const box = (options: BoxOptions = {}, children: UiNode[] = []): UiNode => {
  return makeNode("box", options, children)
}

export const text = (value: string | TextOptions): UiNode => {
  return makeNode("text", typeof value === "string" ? { text: value } : value)
}

export const image = (options: ImageOptions): UiNode => {
  return makeNode("image", options)
}

export const spacer = (options: { size?: number; width?: number; height?: number } = {}): UiNode => {
  return makeNode("spacer", options)
}

export const divider = (options: { color?: string } = {}): UiNode => {
  return makeNode("divider", options)
}

export const button = (label: string, options: ButtonOptions = {}): UiNode => {
  const { onClick, ...props } = options

  if (!onClick) return makeNode("button", { label, ...props })

  return makeNode("button", { label, ...props }, [], ["click"], { click: () => onClick() })
}

export const textInput = (options: TextInputOptions = {}): UiNode => {
  const { onInput, ...props } = options

  if (!onInput) return makeNode("textInput", props, [], ["focus"])

  return makeNode("textInput", props, [], ["input", "focus"], { input: (value) => onInput(String(value)) })
}

export const checkbox = (label: string, options: CheckboxOptions = {}): UiNode => {
  const { checked, onToggle, ...props } = options

  if (!onToggle) return makeNode("checkbox", { label, checked, ...props })

  return makeNode("checkbox", { label, checked, ...props }, [], ["toggle"], {
    toggle: (value) => onToggle(Boolean(value)),
  })
}

export const switchControl = (label: string, options: CheckboxOptions = {}): UiNode => {
  const { checked, onToggle, ...props } = options

  if (!onToggle) return makeNode("switch", { label, checked, ...props })

  return makeNode("switch", { label, checked, ...props }, [], ["toggle"], {
    toggle: (value) => onToggle(Boolean(value)),
  })
}

export const slider = (options: SliderOptions = {}): UiNode => {
  const { onChange, ...props } = options

  if (!onChange) return makeNode("slider", props)

  return makeNode("slider", props, [], ["change"], { change: (value) => onChange(Number(value)) })
}

export const serialize = (nodes: UiNode[]): unknown[] => {
  return nodes.map((node) => {
    const out: Record<string, unknown> = { id: node.id, type: node.type, props: node.props }
    if (node.children) out.children = serialize(node.children)
    if (node.events) out.events = node.events
    return out
  })
}

export const dispatchUiEvent = (id: number, event: string, value: unknown): void => {
  handlers.get(id)?.[event]?.(value)
}

/** Drop the callbacks of nodes that are no longer in the tree. */
export const forgetHandlers = (ids: number[]): void => {
  for (const id of ids) handlers.delete(id)
}

export const ui = {
  column,
  row,
  box,
  text,
  image,
  spacer,
  divider,
  button,
  textInput,
  checkbox,
  switch: switchControl,
  slider,
}
