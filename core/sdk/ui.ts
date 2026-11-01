export type UiNodeType =
  | "column"
  | "row"
  | "box"
  | "scroll"
  | "list"
  | "card"
  | "appBar"
  | "text"
  | "button"
  | "icon"
  | "iconButton"
  | "textInput"
  | "checkbox"
  | "switch"
  | "slider"
  | "select"
  | "chip"
  | "sheet"
  | "progress"
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
  key?: string | number
  width?: number
  height?: number
  visible?: boolean
  opacity?: number
  fillWidth?: boolean
  fillHeight?: boolean
}

export interface LayoutOptions extends CommonOptions {
  gap?: number
  padding?: number
  expand?: boolean
}

export interface ScrollOptions extends CommonOptions {
  gap?: number
  padding?: number
}

export interface ListOptions<T> extends CommonOptions {
  items: T[]
  render: (item: T, index: number) => UiNode
  keyOf?: (item: T, index: number) => string | number
  spacing?: number
  padding?: number
}

export interface CardOptions extends CommonOptions {
  color?: string
  radius?: number
  padding?: number
}

export interface AppBarOptions extends CommonOptions {
  title?: string
  subtitle?: string
  onBack?: () => void
  actions?: UiNode[]
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

export interface IconOptions extends CommonOptions {
  size?: number
  color?: string
}

export interface IconButtonOptions extends CommonOptions {
  enabled?: boolean
  color?: string
  size?: number
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

export interface SelectOption {
  value: string | number
  label: string
}

export interface SelectOptions extends CommonOptions {
  value?: string | number
  options: Array<string | SelectOption>
  onChange?: (value: string | number) => void
}

export interface ChipOptions extends CommonOptions {
  color?: string
  onClick?: () => void
  onRemove?: () => void
}

export interface SheetOptions extends CommonOptions {
  open?: boolean
  title?: string
  fullscreen?: boolean
  onClose?: () => void
}

export interface ProgressOptions extends CommonOptions {
  value?: number
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

export const scroll = (options: ScrollOptions = {}, children: UiNode[] = []): UiNode => {
  return makeNode("scroll", options, children)
}

export const card = (options: CardOptions = {}, children: UiNode[] = []): UiNode => {
  return makeNode("card", options, children)
}

export const list = <T>(options: ListOptions<T>): UiNode => {
  const { items, render, keyOf, ...props } = options
  const children = items.map((item, index) => render(item, index))
  const itemKeys = items.map((item, index) => keyOf?.(item, index) ?? index)

  return makeNode("list", { ...props, itemKeys }, children)
}

export const appBar = (options: AppBarOptions): UiNode => {
  const { onBack, actions = [], ...props } = options

  if (!onBack) return makeNode("appBar", props, actions)

  return makeNode("appBar", props, actions, ["back"], { back: () => onBack() })
}

export const text = (value: string | TextOptions): UiNode => {
  return makeNode("text", typeof value === "string" ? { text: value } : value)
}

export const icon = (name: string, options: IconOptions = {}): UiNode => {
  return makeNode("icon", { name, ...options })
}

export const image = (options: ImageOptions): UiNode => {
  return makeNode("image", options)
}

export const spacer = (
  options: { size?: number; width?: number; height?: number; fillWidth?: boolean; fillHeight?: boolean } = {},
): UiNode => {
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

export const iconButton = (name: string, options: IconButtonOptions = {}): UiNode => {
  const { onClick, ...props } = options

  if (!onClick) return makeNode("iconButton", { name, ...props })

  return makeNode("iconButton", { name, ...props }, [], ["click"], { click: () => onClick() })
}

export const chip = (label: string, options: ChipOptions = {}): UiNode => {
  const { onClick, onRemove, ...props } = options
  const events: string[] = []
  const callbacks: Record<string, UiHandler> = {}

  if (onClick) {
    events.push("click")
    callbacks.click = () => onClick()
  }

  if (onRemove) {
    events.push("remove")
    callbacks.remove = () => onRemove()
  }

  return makeNode("chip", { label, ...props }, [], events, callbacks)
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

export const select = (options: SelectOptions): UiNode => {
  const { onChange, options: items, ...props } = options
  const normalized = items.map((item) => (typeof item === "string" ? { value: item, label: item } : item))

  if (!onChange) return makeNode("select", { ...props, options: normalized })

  return makeNode("select", { ...props, options: normalized }, [], ["change"], {
    change: (value) => onChange(value as string | number),
  })
}

export const progress = (options: ProgressOptions = {}): UiNode => {
  const value = options.value ?? -1

  return makeNode("progress", { ...options, value, indeterminate: value < 0 })
}

export const sheet = (options: SheetOptions = {}, children: UiNode[] = []): UiNode => {
  const { onClose, ...props } = options

  if (!onClose) return makeNode("sheet", props, children)

  return makeNode("sheet", props, children, ["close"], { close: () => onClose() })
}

const nodeSegment = (node: UiNode, index: number, keys?: Array<string | number>): string => {
  const explicit = node.props.key

  if (explicit !== undefined) return String(explicit)
  if (keys) return String(keys[index] ?? index)

  return String(index)
}

export const serialize = (nodes: UiNode[], parentPath = "", keys?: Array<string | number>): unknown[] => {
  return nodes.map((node, index) => {
    const path = `${parentPath}/${nodeSegment(node, index, keys)}`
    const out: Record<string, unknown> = { id: node.id, type: node.type, props: node.props, path }

    if (node.children) {
      const childKeys = node.type === "list" ? (node.props.itemKeys as Array<string | number> | undefined) : undefined

      out.children = serialize(node.children, path, childKeys)
    }

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
  scroll,
  list,
  card,
  appBar,
  text,
  icon,
  image,
  spacer,
  divider,
  button,
  iconButton,
  chip,
  textInput,
  checkbox,
  switch: switchControl,
  slider,
  select,
  progress,
  sheet,
}
