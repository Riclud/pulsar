import type { ColorValue } from "./theme.ts"

export type UiNodeType =
  | "column"
  | "row"
  | "wrap"
  | "stack"
  | "box"
  | "scroll"
  | "list"
  | "grid"
  | "virtualList"
  | "card"
  | "appBar"
  | "text"
  | "selectableText"
  | "button"
  | "icon"
  | "iconButton"
  | "textInput"
  | "textArea"
  | "avatar"
  | "badge"
  | "skeleton"
  | "spinner"
  | "checkbox"
  | "switch"
  | "slider"
  | "select"
  | "rangeSlider"
  | "radio"
  | "radioGroup"
  | "searchField"
  | "chip"
  | "sheet"
  | "pager"
  | "tabs"
  | "navRail"
  | "segmented"
  | "snackbar"
  | "popover"
  | "menu"
  | "accordion"
  | "accordionSection"
  | "fab"
  | "navBar"
  | "neon"
  | "zoomable"
  | "progress"
  | "image"
  | "spacer"
  | "divider"
  | "qml"

export interface UiNode {
  id: number
  type: UiNodeType
  props: Record<string, unknown>
  children?: UiNode[]
  events?: string[]
}

export type UiChild = UiNode | string | number | null | false | undefined | UiChild[]

export interface NeonOptions {
  /** Glow color; defaults to the theme primary. */
  color?: ColorValue
  /** Overall multiplier for the glow. */
  intensity?: number
  /** Glow strength (0..1). */
  glow?: number
  /** Transparent margin that the glow can occupy, in px. */
  padding?: number
  /** Draw the real glow; disable to keep only a plain outline. */
  effects?: boolean
}

export interface QmlOptions extends CommonOptions {
  /** Path to a QML file, relative to the app directory or absolute. */
  source: string
  /** Properties assigned to the loaded QML item on every render. */
  props?: Record<string, unknown>
  /** Events emitted by the loaded item through its `pulsarEmit` function. */
  onEvent?: (name: string, value: unknown) => void
}

interface CommonOptions {
  key?: string | number
  width?: number
  height?: number
  visible?: boolean
  opacity?: number
  fill?: boolean
  fillWidth?: boolean
  fillHeight?: boolean
  /** Hover tooltip text. */
  tooltip?: string
  /** Accessibility name announced by screen readers. */
  a11yLabel?: string
  /** Accessibility hint/description announced after the name. */
  a11yHint?: string
  /** Horizontal placement inside a layout: "start" (default), "center" or "end". */
  align?: "start" | "center" | "end" | "left" | "right"
  /** Cap the width inside a layout (the node stays centered when `align` is "center"). */
  maxWidth?: number
  /** Fade opacity changes over this many milliseconds. */
  animate?: number
  /** Receive the measured size after layout. */
  onLayout?: (size: { width: number; height: number }) => void
  onFocus?: () => void
  onBlur?: () => void
  /** Neon glow around the node; `true` uses the theme primary. */
  neon?: boolean | NeonOptions
}

export interface LayoutOptions extends CommonOptions {
  gap?: number
  padding?: number
  expand?: boolean
}

export interface ContainerOptions extends CommonOptions {
  maxWidth?: number
  gap?: number
  padding?: number
}

export interface ScrollState {
  offset: number
  contentHeight: number
  height: number
}

export interface PageOptions extends CommonOptions {
  gap?: number
  padding?: number
  header?: UiChild
  footer?: UiChild
  /** Allow kinetic fling after a drag; false stops the list as soon as the finger lifts. */
  flick?: boolean
  flickVelocity?: number
  flickDeceleration?: number
  overscroll?: boolean
  onScroll?: (state: ScrollState) => void
}

export interface WrapOptions extends LayoutOptions {
  align?: "start" | "center" | "end"
}

export interface StackOptions extends CommonOptions {
  align?: "start" | "center" | "end"
}

export interface ScrollOptions extends CommonOptions {
  gap?: number
  padding?: number
  flick?: boolean
  flickVelocity?: number
  flickDeceleration?: number
  overscroll?: boolean
  onScroll?: (state: ScrollState) => void
}

export interface ListOptions<T> extends CommonOptions {
  items: T[]
  render: (item: T, index: number) => UiNode
  keyOf?: (item: T, index: number) => string | number
  spacing?: number
  padding?: number
  onScroll?: (state: ScrollState) => void
}

export interface GridOptions extends CommonOptions {
  /** Fixed column count, or "auto" to derive it from the available width. */
  columns?: number | "auto"
  /** Minimum column width used when `columns` is "auto". */
  minColumnWidth?: number
  gap?: number
  padding?: number
}

export interface VirtualListItem {
  key?: string | number
  title: string
  subtitle?: string
  icon?: string
  trailing?: string
  section?: string
}

export interface VirtualSwipeAction {
  id: string
  label?: string
  icon?: string
  color?: ColorValue
}

export interface VirtualListOptions extends CommonOptions {
  items: VirtualListItem[]
  /** Allow the list itself to scroll; disable to let a parent page scroll instead. */
  interactive?: boolean
  spacing?: number
  padding?: number
  selectable?: boolean
  selected?: Array<string | number>
  reorderable?: boolean
  refreshable?: boolean
  stickySections?: boolean
  swipeActions?: VirtualSwipeAction[]
  onEndReached?: () => void
  onRefresh?: () => void
  onSelect?: (key: string | number, selected: boolean) => void
  onPress?: (key: string | number) => void
  onAction?: (key: string | number, action: string) => void
  onReorder?: (from: number, to: number) => void
}

export interface GradientOptions {
  from: ColorValue
  to: ColorValue
  direction?: "vertical" | "horizontal"
}

export interface CardOptions extends CommonOptions {
  color?: ColorValue
  hoverColor?: ColorValue
  radius?: number
  padding?: number
  borderColor?: ColorValue
  borderWidth?: number
  gradient?: GradientOptions
  elevation?: number
  shadowColor?: ColorValue
  onClick?: () => void
  onLongPress?: () => void
}

export interface AppBarOptions extends CommonOptions {
  title?: string
  subtitle?: string
  color?: ColorValue
  textColor?: ColorValue
  onBack?: () => void
  actions?: UiNode[]
}

export interface BoxOptions extends CommonOptions {
  color?: ColorValue
  hoverColor?: ColorValue
  radius?: number
  padding?: number
  borderColor?: ColorValue
  borderWidth?: number
  gradient?: GradientOptions
  elevation?: number
  shadowColor?: ColorValue
  expand?: boolean
  onClick?: () => void
  onLongPress?: () => void
}

export type FontWeight = number | "light" | "normal" | "medium" | "semibold" | "bold"

export interface TextOptions extends CommonOptions {
  text?: string
  color?: ColorValue
  size?: number
  bold?: boolean
  weight?: FontWeight
  italic?: boolean
  strike?: boolean
  family?: string
  letterSpacing?: number
  lineHeight?: number
  wrap?: boolean
  expand?: boolean
  selectable?: boolean
  /** How overflowing text is cut: "left", "right", "middle" or true (right). */
  elide?: "left" | "right" | "middle" | boolean
  /** Render Markdown instead of plain text. */
  markdown?: boolean
  maxLines?: number
  align?: "left" | "center" | "right"
}

export interface ImageOptions extends CommonOptions {
  src: string
  fillMode?: string
  onClick?: () => void
  onLongPress?: () => void
}

export interface AvatarOptions extends CommonOptions {
  src?: string
  name?: string
  size?: number
  radius?: number
  status?: "online" | "away" | "busy" | "offline"
  statusColor?: ColorValue
  badge?: number | "dot"
  badgeColor?: ColorValue
}

export interface BadgeOptions extends CommonOptions {
  label?: string
  count?: number
  dot?: boolean
  color?: ColorValue
  textColor?: ColorValue
}

export interface SkeletonOptions extends CommonOptions {
  variant?: "text" | "rect" | "circle"
  width?: number
  height?: number
  radius?: number
  animated?: boolean
}

export interface SpinnerOptions extends CommonOptions {
  size?: number
  color?: ColorValue
  thickness?: number
  /** 0..1 for determinate progress; omit or negative for indeterminate. */
  value?: number
}

export interface ButtonOptions extends CommonOptions {
  variant?: "solid" | "soft" | "outline" | "ghost" | "elevated"
  size?: "sm" | "md" | "lg"
  color?: ColorValue
  textColor?: ColorValue
  radius?: number
  icon?: string
  iconPosition?: "left" | "right"
  badge?: number | "dot"
  badgeColor?: ColorValue
  elevation?: number
  shadowColor?: ColorValue
  expand?: boolean
  enabled?: boolean
  onClick?: () => void
  onLongPress?: () => void
}

export interface IconOptions extends CommonOptions {
  size?: number
  color?: ColorValue
  badge?: number | "dot"
  badgeColor?: ColorValue
}

export interface IconButtonOptions extends CommonOptions {
  enabled?: boolean
  color?: ColorValue
  size?: number
  badge?: number | "dot"
  badgeColor?: ColorValue
  onClick?: () => void
}

export type KeyboardType = "text" | "email" | "number" | "decimal" | "phone" | "url" | "search"

export interface TextInputOptions extends CommonOptions {
  value?: string
  placeholder?: string
  variant?: "filled" | "outline"
  color?: ColorValue
  textColor?: ColorValue
  borderColor?: ColorValue
  radius?: number
  expand?: boolean
  /** Render a multi-line TextArea instead of a single-line field. */
  multiline?: boolean
  /** Mask the value (password field). */
  password?: boolean
  /** Draw the text with a strike-through line. */
  strike?: boolean
  keyboardType?: KeyboardType
  /** Focus the field as soon as it is created. */
  autoFocus?: boolean
  /** Focus the field when set to true; the request fires once per true edge. */
  focus?: boolean
  maxLength?: number
  readOnly?: boolean
  selectable?: boolean
  /** Visible lines for a multiline field; also sets its preferred height. */
  lines?: number
  onInput?: (value: string) => void
  onSubmitted?: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
}

export interface CheckboxOptions extends CommonOptions {
  checked?: boolean
  onToggle?: (checked: boolean) => void
}

export interface SliderOptions extends CommonOptions {
  value?: number
  min?: number
  max?: number
  color?: ColorValue
  expand?: boolean
  onChange?: (value: number) => void
}

export interface RangeSliderOptions extends CommonOptions {
  min?: number
  max?: number
  from?: number
  to?: number
  step?: number
  color?: ColorValue
  expand?: boolean
  onChange?: (from: number, to: number) => void
}

export interface RadioOptions extends CommonOptions {
  checked?: boolean
  color?: ColorValue
  enabled?: boolean
  onSelect?: () => void
}

export interface RadioGroupOption {
  value: string | number
  label: string
}

export interface RadioGroupOptions extends CommonOptions {
  options: Array<string | RadioGroupOption>
  value?: string | number
  direction?: "vertical" | "horizontal"
  color?: ColorValue
  onChange?: (value: string | number) => void
}

export interface SelectOption {
  value: string | number
  label: string
}

export interface SelectOptions extends CommonOptions {
  value?: string | number
  options: Array<string | SelectOption>
  color?: ColorValue
  enabled?: boolean
  onChange?: (value: string | number) => void
}

export interface SearchFieldOptions extends CommonOptions {
  value?: string
  placeholder?: string
  variant?: "filled" | "outline"
  color?: ColorValue
  borderColor?: ColorValue
  radius?: number
  debounce?: number
  enabled?: boolean
  focus?: boolean
  onInput?: (value: string) => void
  onSubmit?: (value: string) => void
  onClear?: () => void
  onFocus?: () => void
  onBlur?: () => void
}

export interface MenuItem {
  id: string
  label: string
  icon?: string
  shortcut?: string
  disabled?: boolean
  separator?: boolean
  danger?: boolean
}

export interface MenuOptions extends CommonOptions {
  open?: boolean
  items: MenuItem[]
  x?: number
  y?: number
  maxHeight?: number
  closeOnSelect?: boolean
  dismissible?: boolean
  modal?: boolean
  duration?: number
  elevation?: number
  shadowColor?: ColorValue
  onSelect?: (id: string) => void
  onClose?: () => void
}

export interface AccordionOptions extends CommonOptions {
  multiple?: boolean
  onChange?: (index: number, open: boolean) => void
}

export interface AccordionSectionOptions extends CommonOptions {
  title?: string
  subtitle?: string
  icon?: string
  open?: boolean
  defaultOpen?: boolean
  enabled?: boolean
}

export interface FabOptions extends CommonOptions {
  icon: string
  size?: number
  color?: ColorValue
  textColor?: ColorValue
  elevation?: number
  shadowColor?: ColorValue
  placement?: "bottom-end" | "inline"
  enabled?: boolean
  onClick?: () => void
}

export interface ToolbarOptions extends CommonOptions {
  color?: ColorValue
  borderColor?: ColorValue
  borderWidth?: number
  radius?: number
  padding?: number
  gap?: number
  elevation?: number
  shadowColor?: ColorValue
  actions?: UiNode[]
}

export interface EmptyStateOptions extends CommonOptions {
  icon?: string
  title?: string
  text?: string
  action?: UiNode
  color?: ColorValue
}

export interface ChipOptions extends CommonOptions {
  variant?: "solid" | "soft" | "outline"
  color?: ColorValue
  textColor?: ColorValue
  selected?: boolean
  selectedColor?: ColorValue
  onClick?: () => void
  onRemove?: () => void
  onLongPress?: () => void
}

export interface SheetOptions extends CommonOptions {
  open?: boolean
  title?: string
  fullscreen?: boolean
  dismissible?: boolean
  /** "center" (default) or "bottom" bottom sheet. */
  placement?: "center" | "bottom"
  /** Show a drag handle on bottom sheets. */
  handle?: boolean
  duration?: number
  elevation?: number
  shadowColor?: ColorValue
  onClose?: () => void
}

export interface NavRailItem {
  label: string
  icon?: string
}

export interface NavRailOptions extends CommonOptions {
  items: Array<string | NavRailItem>
  index?: number
  expanded?: boolean
  padding?: number
  onChange?: (index: number) => void
}

export interface PagerOptions extends CommonOptions {
  index?: number
  interactive?: boolean
  onPageChange?: (index: number) => void
}

export interface TabItem {
  label: string
  icon?: string
}

export interface TabsOptions extends CommonOptions {
  items: Array<string | TabItem>
  index?: number
  onChange?: (index: number) => void
}

export interface SegmentedOptions extends CommonOptions {
  items: Array<string | TabItem>
  value?: number
  onChange?: (index: number) => void
}

export interface NavBarItem {
  label: string
  icon?: string
}

export interface NavBarOptions extends CommonOptions {
  items: Array<string | NavBarItem>
  value?: number
  color?: ColorValue
  activeColor?: ColorValue
  showLabels?: boolean
  onChange?: (index: number) => void
}

export interface SnackbarOptions extends CommonOptions {
  open?: boolean
  text: string
  actionLabel?: string
  duration?: number
  onAction?: () => void
  onClose?: () => void
}

export interface PopoverOptions extends CommonOptions {
  open?: boolean
  x?: number
  y?: number
  modal?: boolean
  dismissible?: boolean
  duration?: number
  elevation?: number
  shadowColor?: ColorValue
  onClose?: () => void
}

export interface ZoomableOptions extends CommonOptions {
  minScale?: number
  maxScale?: number
  zoom?: number
  onZoom?: (scale: number) => void
}

export interface ProgressOptions extends CommonOptions {
  value?: number
  color?: ColorValue
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

const NEON_LAYOUT_KEYS = ["key", "fill", "fillWidth", "fillHeight", "expand", "align", "visible"] as const

const makeNode = <P extends object>(
  type: UiNodeType,
  props: P,
  children: UiChild[] = [],
  events: string[] = [],
  callbacks?: Record<string, UiHandler>,
): UiNode => {
  const { neon, onLayout, onFocus, onBlur, ...rest } = props as P & {
    neon?: boolean | NeonOptions
    onLayout?: (size: { width: number; height: number }) => void
    onFocus?: () => void
    onBlur?: () => void
  }
  const id = nextId++
  const layout = typeof onLayout === "function" ? onLayout : null
  const focus = typeof onFocus === "function" ? onFocus : null
  const blur = typeof onBlur === "function" ? onBlur : null
  const eventList = [...events]
  const callbackMap: Record<string, UiHandler> = { ...(callbacks ?? {}) }

  if (layout) {
    eventList.push("layout")
    callbackMap.layout = (value) => {
      const size = value as { width: number; height: number }

      layout({ width: size.width, height: size.height })
    }
  }

  if (focus) {
    eventList.push("focus")
    callbackMap.focus = () => focus()
  }

  if (blur) {
    eventList.push("blur")
    callbackMap.blur = () => blur()
  }

  if (Object.keys(callbackMap).length > 0) handlers.set(id, callbackMap)

  const node: UiNode = { id, type, props: rest as Record<string, unknown> }
  const nodes = flatten(children)

  if (nodes.length > 0) node.children = nodes
  if (eventList.length > 0) node.events = eventList

  if (neon === undefined || neon === false) return node

  const neonProps: Record<string, unknown> = { ...(neon === true ? {} : neon) }

  for (const key of NEON_LAYOUT_KEYS) {
    if (node.props[key] !== undefined) neonProps[key] = node.props[key]
  }

  return { id: nextId++, type: "neon", props: neonProps, children: [node] }
}

const withLongPress = <P extends { onClick?: () => void; onLongPress?: () => void }>(
  type: UiNodeType,
  options: P,
  children: UiChild[] = [],
): UiNode => {
  const { onClick, onLongPress, ...props } = options
  const events: string[] = []
  const callbacks: Record<string, UiHandler> = {}

  if (onClick) {
    events.push("click")
    callbacks.click = () => onClick()
  }

  if (onLongPress) {
    events.push("longPress")
    callbacks.longPress = () => onLongPress()
  }

  if (events.length === 0) return makeNode(type, props, children)

  return makeNode(type, props, children, events, callbacks)
}

export const column = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("column", options, children)
}

export const row = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("row", options, children)
}

export const wrap = (options: WrapOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("wrap", options, children)
}

export const stack = (options: StackOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("stack", options, children)
}

export const box = (options: BoxOptions = {}, ...children: UiChild[]): UiNode => {
  return withLongPress("box", options, children)
}

export const scroll = (options: ScrollOptions = {}, ...children: UiChild[]): UiNode => {
  const { onScroll, ...props } = options

  if (!onScroll) return makeNode("scroll", props, children)

  return makeNode("scroll", props, children, ["scroll"], {
    scroll: (value) => onScroll(value as ScrollState),
  })
}

export const card = (options: CardOptions = {}, ...children: UiChild[]): UiNode => {
  return withLongPress("card", options, children)
}

const implicitItemKey = (value: unknown): string | number | undefined => {
  if (value === null || typeof value !== "object") return undefined

  const record = value as Record<string, unknown>
  const key = record.ID ?? record.id

  return typeof key === "string" || typeof key === "number" ? key : undefined
}

export const list = <T>(options: ListOptions<T>): UiNode => {
  const { items, render, keyOf, onScroll, ...props } = options
  const children = items.map((item, index) => render(item, index))
  const itemKeys = items.map((item, index) => keyOf?.(item, index) ?? implicitItemKey(item) ?? index)

  if (!onScroll) return makeNode("list", { ...props, itemKeys }, children)

  return makeNode("list", { ...props, itemKeys }, children, ["scroll"], {
    scroll: (value) => onScroll(value as ScrollState),
  })
}

export const grid = (options: GridOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("grid", options, children)
}

export const virtualList = (options: VirtualListOptions): UiNode => {
  const { onEndReached, onRefresh, onSelect, onPress, onAction, onReorder, ...props } = options
  const events: string[] = []
  const callbacks: Record<string, UiHandler> = {}

  if (onEndReached) {
    events.push("endReached")
    callbacks.endReached = () => onEndReached()
  }

  if (onRefresh) {
    events.push("refresh")
    callbacks.refresh = () => onRefresh()
  }

  if (onSelect) {
    events.push("select")
    callbacks.select = (value) => {
      const data = value as { key: string | number; selected: boolean }

      onSelect(data.key, data.selected)
    }
  }

  if (onPress) {
    events.push("press")
    callbacks.press = (value) => onPress(value as string | number)
  }

  if (onAction) {
    events.push("action")
    callbacks.action = (value) => {
      const data = value as { key: string | number; action: string }

      onAction(data.key, data.action)
    }
  }

  if (onReorder) {
    events.push("reorder")
    callbacks.reorder = (value) => {
      const data = value as { from: number; to: number }

      onReorder(data.from, data.to)
    }
  }

  return makeNode("virtualList", props, [], events, callbacks)
}

export const appBar = (options: AppBarOptions = {}, ...children: UiChild[]): UiNode => {
  const { onBack, actions, ...props } = options
  const items = actions ?? flatten(children)

  if (!onBack) return makeNode("appBar", props, items)

  return makeNode("appBar", props, items, ["back"], { back: () => onBack() })
}

export const text = (value: string | TextOptions): UiNode => {
  if (typeof value === "string") return makeNode("text", { text: value })

  return makeNode(value.selectable ? "selectableText" : "text", value)
}

export const icon = (name: string, options: IconOptions = {}): UiNode => {
  return makeNode("icon", { name, ...options })
}

export const image = (options: ImageOptions): UiNode => {
  return withLongPress("image", options)
}

export const avatar = (options: AvatarOptions = {}): UiNode => {
  return makeNode("avatar", options)
}

export const badge = (options: BadgeOptions = {}): UiNode => {
  return makeNode("badge", options)
}

export const skeleton = (options: SkeletonOptions = {}): UiNode => {
  return makeNode("skeleton", options)
}

export const spinner = (options: SpinnerOptions = {}): UiNode => {
  return makeNode("spinner", { ...options, value: options.value ?? -1 })
}

export const spacer = (
  options: { size?: number; width?: number; height?: number; fillWidth?: boolean; fillHeight?: boolean } = {},
): UiNode => {
  return makeNode("spacer", options)
}

export const divider = (options: { color?: ColorValue } = {}): UiNode => {
  return makeNode("divider", options)
}

export const button = (label: string, options: ButtonOptions = {}): UiNode => {
  const { onClick, onLongPress, ...props } = options
  const events: string[] = []
  const callbacks: Record<string, UiHandler> = {}

  if (onClick) {
    events.push("click")
    callbacks.click = () => onClick()
  }

  if (onLongPress) {
    events.push("longPress")
    callbacks.longPress = () => onLongPress()
  }

  return makeNode("button", { label, ...props }, [], events, callbacks)
}

export const iconButton = (name: string, options: IconButtonOptions = {}): UiNode => {
  const { onClick, ...props } = options

  if (!onClick) return makeNode("iconButton", { name, ...props })

  return makeNode("iconButton", { name, ...props }, [], ["click"], { click: () => onClick() })
}

export const chip = (label: string, options: ChipOptions = {}): UiNode => {
  const { onClick, onRemove, onLongPress, ...props } = options
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

  if (onLongPress) {
    events.push("longPress")
    callbacks.longPress = () => onLongPress()
  }

  return makeNode("chip", { label, ...props }, [], events, callbacks)
}

export const textInput = (options: TextInputOptions = {}): UiNode => {
  const { onInput, onSubmitted, onFocus, onBlur, multiline, ...props } = options
  const type: UiNodeType = multiline ? "textArea" : "textInput"
  const events: string[] = ["focus", "blur"]
  const callbacks: Record<string, UiHandler> = {}

  if (onInput) {
    events.push("input")
    callbacks.input = (value) => {
      if (value === null || value === undefined) return

      onInput(String(value))
    }
  }

  if (onSubmitted) {
    events.push("submit")
    callbacks.submit = (value) => onSubmitted(value === null || value === undefined ? "" : String(value))
  }

  if (onFocus) {
    events.push("focus")
    callbacks.focus = () => onFocus()
  }

  if (onBlur) {
    events.push("blur")
    callbacks.blur = () => onBlur()
  }

  return makeNode(type, { ...props, multiline: Boolean(multiline) }, [], events, callbacks)
}

export const textArea = (options: Omit<TextInputOptions, "multiline"> = {}): UiNode => {
  return textInput({ ...options, multiline: true })
}

export const searchField = (options: SearchFieldOptions = {}): UiNode => {
  const { onInput, onSubmit, onClear, onFocus, onBlur, ...props } = options
  const events: string[] = []
  const callbacks: Record<string, UiHandler> = {}

  if (onInput) {
    events.push("input")
    callbacks.input = (value) => onInput(value === null || value === undefined ? "" : String(value))
  }

  if (onSubmit) {
    events.push("submit")
    callbacks.submit = (value) => onSubmit(value === null || value === undefined ? "" : String(value))
  }

  if (onClear) {
    events.push("clear")
    callbacks.clear = () => onClear()
  }

  if (onFocus) {
    events.push("focus")
    callbacks.focus = () => onFocus()
  }

  if (onBlur) {
    events.push("blur")
    callbacks.blur = () => onBlur()
  }

  return makeNode("searchField", props, [], events, callbacks)
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

export const rangeSlider = (options: RangeSliderOptions = {}): UiNode => {
  const { onChange, ...props } = options

  if (!onChange) return makeNode("rangeSlider", props)

  return makeNode("rangeSlider", props, [], ["change"], {
    change: (value) => {
      const range = value as { from: number; to: number }

      onChange(Number(range.from), Number(range.to))
    },
  })
}

export const radio = (label: string, options: RadioOptions = {}): UiNode => {
  const { onSelect, ...props } = options

  if (!onSelect) return makeNode("radio", { label, ...props })

  return makeNode("radio", { label, ...props }, [], ["select"], { select: () => onSelect() })
}

export const radioGroup = (options: RadioGroupOptions): UiNode => {
  const { onChange, options: items, ...props } = options
  const normalized = items.map((item) => (typeof item === "string" ? { value: item, label: item } : item))

  if (!onChange) return makeNode("radioGroup", { ...props, options: normalized })

  return makeNode("radioGroup", { ...props, options: normalized }, [], ["change"], {
    change: (value) => onChange(value as string | number),
  })
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

export const bottomSheet = (options: SheetOptions = {}, ...children: UiChild[]): UiNode => {
  return sheet({ ...options, placement: "bottom" }, ...children)
}

export const pager = (options: PagerOptions = {}, ...children: UiChild[]): UiNode => {
  const { onPageChange, ...props } = options

  if (!onPageChange) return makeNode("pager", props, children)

  return makeNode("pager", props, children, ["change"], {
    change: (value) => onPageChange(Number(value)),
  })
}

const normalizeTabs = (items: Array<string | TabItem>): TabItem[] => {
  return items.map((item) => (typeof item === "string" ? { label: item } : item))
}

export const navRail = (options: NavRailOptions, ...children: UiChild[]): UiNode => {
  const { onChange, items, ...props } = options
  const normalized = items.map((item) => (typeof item === "string" ? { label: item } : item))

  if (!onChange) return makeNode("navRail", { ...props, items: normalized }, children)

  return makeNode("navRail", { ...props, items: normalized }, children, ["change"], {
    change: (value) => onChange(Number(value)),
  })
}

export const tabs = (options: TabsOptions, ...children: UiChild[]): UiNode => {
  const { onChange, items, ...props } = options
  const normalized = normalizeTabs(items)

  if (!onChange) return makeNode("tabs", { ...props, items: normalized }, children)

  return makeNode("tabs", { ...props, items: normalized }, children, ["change"], {
    change: (value) => onChange(Number(value)),
  })
}

export const segmented = (options: SegmentedOptions): UiNode => {
  const { onChange, items, ...props } = options
  const normalized = normalizeTabs(items)

  if (!onChange) return makeNode("segmented", { ...props, items: normalized })

  return makeNode("segmented", { ...props, items: normalized }, [], ["change"], {
    change: (value) => onChange(Number(value)),
  })
}

export const snackbar = (options: SnackbarOptions): UiNode => {
  const { onAction, onClose, ...props } = options
  const events: string[] = []
  const callbacks: Record<string, UiHandler> = {}

  if (onAction) {
    events.push("action")
    callbacks.action = () => onAction()
  }

  if (onClose) {
    events.push("close")
    callbacks.close = () => onClose()
  }

  return makeNode("snackbar", props, [], events, callbacks)
}

export const popover = (options: PopoverOptions = {}, ...children: UiChild[]): UiNode => {
  const { onClose, ...props } = options

  if (!onClose) return makeNode("popover", props, children)

  return makeNode("popover", props, children, ["close"], { close: () => onClose() })
}

export const zoomable = (options: ZoomableOptions = {}, ...children: UiChild[]): UiNode => {
  const { onZoom, ...props } = options

  if (!onZoom) return makeNode("zoomable", props, children)

  return makeNode("zoomable", props, children, ["zoom"], {
    zoom: (value) => onZoom(Number(value)),
  })
}

export const Qml = (options: QmlOptions): UiNode => {
  const { source, props, onEvent, ...rest } = options

  if (!onEvent) return makeNode("qml", { ...rest, source, props: props ?? {} })

  return makeNode("qml", { ...rest, source, props: props ?? {} }, [], ["event"], {
    event: (value) => {
      const data = value as { name: string; value: unknown }

      onEvent(String(data.name), data.value)
    },
  })
}

export const menu = (options: MenuOptions): UiNode => {
  const { onSelect, onClose, ...props } = options
  const events: string[] = []
  const callbacks: Record<string, UiHandler> = {}

  if (onSelect) {
    events.push("select")
    callbacks.select = (value) => onSelect(String(value))
  }

  if (onClose) {
    events.push("close")
    callbacks.close = () => onClose()
  }

  return makeNode("menu", props, [], events, callbacks)
}

export const accordionSection = (options: AccordionSectionOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("accordionSection", options, children)
}

export const accordion = (options: AccordionOptions = {}, ...children: UiChild[]): UiNode => {
  const { onChange, ...props } = options

  if (!onChange) return makeNode("accordion", props, children)

  return makeNode("accordion", props, children, ["toggle"], {
    toggle: (value) => {
      const state = value as { index: number; open: boolean }

      onChange(Number(state.index), Boolean(state.open))
    },
  })
}

export const fab = (options: FabOptions): UiNode => {
  const { onClick, ...props } = options

  if (!onClick) return makeNode("fab", props)

  return makeNode("fab", props, [], ["click"], { click: () => onClick() })
}

export const toolbar = (options: ToolbarOptions = {}, ...children: UiChild[]): UiNode => {
  const { actions, gap = 8, padding = 8, ...props } = options

  return box({ ...props, padding }, row({ gap, fillWidth: true, expand: true }, ...children, ...(actions ?? [])))
}

export const emptyState = (options: EmptyStateOptions = {}): UiNode => {
  const { icon: glyph = "inbox", title = "Nothing here", text: body, action, color = "mauve", ...props } = options
  const iconSize = 28
  const circleSize = 64

  return column(
    { gap: 10, padding: 24, align: "center", fillWidth: true, ...props },
    box(
      {
        color,
        radius: circleSize / 2,
        width: circleSize,
        height: circleSize,
        padding: (circleSize - iconSize) / 2,
        align: "center",
      },
      column({ gap: 0, align: "center" }, icon(glyph, { size: iconSize, color: "text" })),
    ),
    text({ text: title, size: 17, weight: "semibold", color: "text", align: "center", fillWidth: true }),
    body ? text({ text: body, size: 13, color: "subtext", align: "center", wrap: true, fillWidth: true }) : null,
    action ?? null,
  )
}

export const neon = (options: NeonOptions = {}, ...children: UiChild[]): UiNode => {
  return makeNode("neon", options, children)
}

export const navBar = (options: NavBarOptions): UiNode => {
  const { onChange, items, ...props } = options
  const normalized = items.map((item) => (typeof item === "string" ? { label: item } : item))

  if (!onChange) return makeNode("navBar", { ...props, items: normalized })

  return makeNode("navBar", { ...props, items: normalized }, [], ["change"], {
    change: (value) => onChange(Number(value)),
  })
}

export const container = (options: ContainerOptions = {}, ...children: UiChild[]): UiNode => {
  const { maxWidth = 900, gap = 12, padding = 16, ...props } = options

  return box(
    { ...props, maxWidth, padding, fillWidth: true, align: "center" },
    column({ gap, fillWidth: true, fillHeight: props.fillHeight === true }, ...children),
  )
}

export const page = (options: PageOptions = {}, ...children: UiChild[]): UiNode => {
  const {
    gap = 12,
    padding = 16,
    header,
    footer,
    flick,
    flickVelocity,
    flickDeceleration,
    overscroll,
    onScroll,
    ...props
  } = options

  return column(
    { ...props, fill: true, gap, padding },
    header ?? null,
    scroll(
      { fill: true, flick, flickVelocity, flickDeceleration, overscroll, onScroll },
      column({ gap, fillWidth: true }, ...children),
    ),
    footer ?? null,
  )
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
export const Wrap = (options: WrapOptions = {}, ...children: UiChild[]): UiNode => wrap(options, ...children)
export const Stack = (options: StackOptions = {}, ...children: UiChild[]): UiNode => stack(options, ...children)

export const Box = (options: BoxOptions = {}, ...children: UiChild[]): UiNode => box(options, ...children)

export const Scroll = (options: ScrollOptions = {}, ...children: UiChild[]): UiNode => scroll(options, ...children)

export const Grid = (options: GridOptions = {}, ...children: UiChild[]): UiNode => grid(options, ...children)

export const VirtualList = (options: VirtualListOptions): UiNode => virtualList(options)

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

export const TextArea = (options: Omit<TextInputOptions, "multiline"> = {}): UiNode => textArea(options)

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

export const Pager = (options: PagerOptions = {}, ...children: UiChild[]): UiNode => pager(options, ...children)

export const Tabs = (options: TabsOptions, ...children: UiChild[]): UiNode => tabs(options, ...children)

export const NavigationRail = (options: NavRailOptions, ...children: UiChild[]): UiNode => navRail(options, ...children)

export const Segmented = (options: SegmentedOptions): UiNode => segmented(options)

export const Snackbar = (options: SnackbarOptions): UiNode => snackbar(options)

export const Popover = (options: PopoverOptions = {}, ...children: UiChild[]): UiNode => popover(options, ...children)

export const Zoomable = (options: ZoomableOptions = {}, ...children: UiChild[]): UiNode =>
  zoomable(options, ...children)

export const RangeSlider = (options: RangeSliderOptions = {}): UiNode => rangeSlider(options)

export const Radio = (label: string, options: RadioOptions = {}): UiNode => radio(label, options)

export const RadioGroup = (options: RadioGroupOptions): UiNode => radioGroup(options)

export const SearchField = (options: SearchFieldOptions = {}): UiNode => searchField(options)

export const Menu = (options: MenuOptions): UiNode => menu(options)

export const Accordion = (options: AccordionOptions = {}, ...children: UiChild[]): UiNode =>
  accordion(options, ...children)

export const AccordionSection = (options: AccordionSectionOptions = {}, ...children: UiChild[]): UiNode =>
  accordionSection(options, ...children)

export const Fab = (options: FabOptions): UiNode => fab(options)

export const Toolbar = (options: ToolbarOptions = {}, ...children: UiChild[]): UiNode => toolbar(options, ...children)

export const EmptyState = (options: EmptyStateOptions = {}): UiNode => emptyState(options)

export const Neon = (options: NeonOptions = {}, ...children: UiChild[]): UiNode => neon(options, ...children)

export const NavBar = (options: NavBarOptions): UiNode => navBar(options)

export const Container = (options: ContainerOptions = {}, ...children: UiChild[]): UiNode =>
  container(options, ...children)
export const Page = (options: PageOptions = {}, ...children: UiChild[]): UiNode => page(options, ...children)

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
export const Avatar = (options: AvatarOptions = {}): UiNode => avatar(options)
export const Badge = (options: BadgeOptions = {}): UiNode => badge(options)
export const Skeleton = (options: SkeletonOptions = {}): UiNode => skeleton(options)
export const Spinner = (options: SpinnerOptions = {}): UiNode => spinner(options)
export const BottomSheet = (options: SheetOptions = {}, ...children: UiChild[]): UiNode =>
  bottomSheet(options, ...children)

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
  wrap,
  stack,
  page,
  box,
  scroll,
  list,
  grid,
  virtualList,
  card,
  appBar,
  text,
  icon,
  image,
  avatar,
  badge,
  skeleton,
  spinner,
  spacer,
  divider,
  button,
  iconButton,
  chip,
  textInput,
  textArea,
  checkbox,
  switch: switchControl,
  slider,
  rangeSlider,
  radio,
  radioGroup,
  searchField,
  select,
  progress,
  menu,
  accordion,
  accordionSection,
  fab,
  toolbar,
  emptyState,
  neon,
  navBar,
  container,
  sheet,
  bottomSheet,
  pager,
  tabs,
  navRail,
  segmented,
  snackbar,
  popover,
  zoomable,
  qml: Qml,
}
