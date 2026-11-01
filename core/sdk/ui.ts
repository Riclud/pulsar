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

export type UiChild = UiNode | string | number | null | false | undefined | UiChild[]

interface CommonOptions {
  key?: string | number
  width?: number
  height?: number
  visible?: boolean
  opacity?: number
  fill?: boolean
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
  dismissible?: boolean
  duration?: number
  onClose?: () => void
}

export interface ProgressOptions extends CommonOptions {
  value?: number
}

export interface ForOptions<T> extends Omit<ListOptions<T>, "items" | "render"> {
  each: T[] | (() => T[])
  render: (item: T, index: number) => UiNode
}

export interface WhenOptions {
  test: unknown | (() => unknown)
  then: UiChild | (() => UiChild)
  else?: UiChild | (() => UiChild)
}

type UiHandler = (value: unknown) => void

const BINDING: unique symbol = Symbol("pulsar.binding")

interface BindingBox<T> {
  readonly [BINDING]: () => T
}

export const bind = <T>(read: () => T): T => {
  return { [BINDING]: read } as unknown as T
}

const isBinding = (value: unknown): value is BindingBox<unknown> => {
  return typeof value === "object" && value !== null && BINDING in value
}

const resolveValue = <T>(value: T | (() => T)): T => {
  if (isBinding(value)) return (value as unknown as BindingBox<T>)[BINDING]()

  return typeof value === "function" ? (value as () => T)() : value
}

const resolveChild = (value: UiChild | (() => UiChild)): UiChild => {
  return typeof value === "function" ? value() : value
}

const flatten = (children: UiChild[], out: UiNode[] = []): UiNode[] => {
  for (const child of children) {
    if (!child) continue

    if (Array.isArray(child)) {
      flatten(child, out)
      continue
    }

    if (typeof child === "object") out.push(child)
  }

  return out
}

const textOf = (children: UiChild[]): string => {
  let out = ""

  for (const child of children) {
    if (typeof child === "string" || typeof child === "number") out += String(child)
    else if (Array.isArray(child)) out += textOf(child)
  }

  return out
}

const resolveProps = (props: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props))
    out[key] = isBinding(value) ? (value as BindingBox<unknown>)[BINDING]() : value

  return out
}

const handlers = new Map<number, Record<string, UiHandler>>()
let nextId = 1

const makeNode = <P extends object>(
  type: UiNodeType,
  props: P,
  children: UiChild[] = [],
  events: string[] = [],
  callbacks?: Record<string, UiHandler>,
): UiNode => {
  const id = nextId++

  if (callbacks) handlers.set(id, callbacks)

  const node: UiNode = { id, type, props: props as Record<string, unknown> }
  const nodes = flatten(children)

  if (nodes.length > 0) node.children = nodes
  if (events.length > 0) node.events = events

  return node
}

export const column = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("column", options, children)
}

export const row = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("row", options, children)
}

export const box = (options: BoxOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("box", options, children)
}

export const scroll = (options: ScrollOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("scroll", options, children)
}

export const card = (options: CardOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("card", options, children)
}

export const list = <T>(options: ListOptions<T>): UiNode => {
  const { items, render, keyOf, ...props } = options
  const children = items.map((item, index) => render(item, index))
  const itemKeys = items.map((item, index) => keyOf?.(item, index) ?? index)

  return makeNode("list", { ...props, itemKeys }, children)
}

export const appBar = (options: AppBarOptions = {}, ...children: UiChild[]): UiNode => {
  const { onBack, actions, ...props } = options
  const items = actions ?? flatten(children)

  if (!onBack) return makeNode("appBar", props, items)

  return makeNode("appBar", props, items, ["back"], { back: () => onBack() })
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

  return makeNode("textInput", props, [], ["input", "focus"], {
    input: (value) => {
      if (value === null || value === undefined) return

      onInput(String(value))
    },
  })
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

export const sheet = (options: SheetOptions = {}, ...children: UiChild[]): UiNode => {
  const { onClose, ...props } = options

  if (!onClose) return makeNode("sheet", props, children)

  return makeNode("sheet", props, children, ["close"], { close: () => onClose() })
}

export const For = <T>(options: ForOptions<T>): UiNode => {
  const { each, keyOf, render, ...props } = options

  return list({ ...props, items: resolveValue(each), keyOf, render })
}

export const When = (options: WhenOptions): UiChild => {
  return resolveValue(options.test) ? resolveChild(options.then) : resolveChild(options.else ?? null)
}

export type DefinedComponent<P> = (props: P, ...children: UiChild[]) => UiNode

export const defineComponent = <P>(component: DefinedComponent<P>): DefinedComponent<P> => {
  return component
}

export const Column = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => column(options, ...children)

export const Row = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => row(options, ...children)

export const Box = (options: BoxOptions = {}, ...children: UiChild[]): UiNode => box(options, ...children)

export const Scroll = (options: ScrollOptions = {}, ...children: UiChild[]): UiNode => scroll(options, ...children)

export const Card = (options: CardOptions = {}, ...children: UiChild[]): UiNode => card(options, ...children)

export const Header = (options: AppBarOptions = {}, ...children: UiChild[]): UiNode => {
  return appBar({ ...options, actions: options.actions ?? flatten(children) })
}

export const AppBar = Header

export const Text = (options: TextOptions = {}, ...children: UiChild[]): UiNode => {
  return text({ ...options, text: options.text ?? textOf(children) })
}

export const Button = (options: ButtonOptions & { label?: string } = {}, ...children: UiChild[]): UiNode => {
  return button(options.label ?? textOf(children), options)
}

export const Icon = (options: IconOptions & { name?: string; icon?: string }): UiNode => {
  return icon(options.name ?? options.icon ?? "", options)
}

export const IconButton = (options: IconButtonOptions & { name?: string; icon?: string } = {}): UiNode => {
  return iconButton(options.name ?? options.icon ?? "", options)
}

export const Chip = (options: ChipOptions & { label?: string } = {}, ...children: UiChild[]): UiNode => {
  return chip(options.label ?? textOf(children), options)
}

export const Input = (options: TextInputOptions = {}): UiNode => textInput(options)

export const TextField = Input

export const Checkbox = (options: CheckboxOptions & { label?: string } = {}, ...children: UiChild[]): UiNode => {
  return checkbox(options.label ?? textOf(children), options)
}

export const Switch = (options: CheckboxOptions & { label?: string } = {}, ...children: UiChild[]): UiNode => {
  return switchControl(options.label ?? textOf(children), options)
}

export const Slider = slider
export const Select = select
export const Progress = progress

export const Sheet = (options: SheetOptions = {}, ...children: UiChild[]): UiNode => sheet(options, ...children)

export const Modal = (options: SheetOptions = {}, ...children: UiChild[]): UiNode => {
  return sheet({ ...options, fullscreen: options.fullscreen ?? false }, ...children)
}

export const List = <T>(
  options: Omit<ListOptions<T>, "render"> & { render?: (item: T, index: number) => UiNode },
  ...children: UiChild[]
): UiNode => {
  const { render, ...props } = options

  if (render) return list({ ...props, render })

  const rows = flatten(children)

  return list({ ...props, render: (_item, index) => rows[index] ?? box({}) })
}

export const Spacer = spacer
export const Divider = divider
export const Image = image

const nodeSegment = (node: UiNode, index: number, keys?: Array<string | number>): string => {
  const explicit = node.props.key

  if (explicit !== undefined) return String(explicit)
  if (keys) return String(keys[index] ?? index)

  return String(index)
}

export const serialize = (nodes: UiNode[], parentPath = "", keys?: Array<string | number>): unknown[] => {
  return nodes.map((node, index) => {
    const path = `${parentPath}/${nodeSegment(node, index, keys)}`
    const out: Record<string, unknown> = { id: node.id, type: node.type, props: resolveProps(node.props), path }

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
