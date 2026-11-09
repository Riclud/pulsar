import { Computation } from "./reactive.ts"
import type { ColorValue } from "./theme.ts"

export type UiNodeType =
  | "canvas"
  | "shader"
  | "arrange"
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
  /** Path segments of children that stay put when a conditional sibling is absent. */
  slots?: string[]
  events?: string[]
  callbacks?: Record<string, (value: unknown) => void>
  /** Set on nodes that are reused between renders, so their serialized form can be too. */
  cacheable?: boolean
  serialized?: { path: string; out: Record<string, unknown> }
  collected?: { path: string; routes: UiRoutes; ids: number[] }
}

export type UiRoutes = Record<string, Record<string, (value: unknown) => void>>

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

export type A11yRole =
  | "button"
  | "checkbox"
  | "radio"
  | "switch"
  | "slider"
  | "text"
  | "image"
  | "list"
  | "listItem"
  | "dialog"
  | "link"
  | "progress"
  | "tab"
  | "tabList"
  | "menu"
  | "menuItem"
  | "toolbar"
  | "group"
  | "pane"

export interface MotionState {
  opacity?: number
  x?: number
  y?: number
  scale?: number
}

export interface MotionTransition {
  duration?: number
  curve?: "spring" | "ease" | "linear"
}

export interface DragRelease {
  direction: "left" | "right" | "up" | "down"
  distance: number
}

export interface DragOptions {
  axis: "x" | "y"
  threshold?: number
  onRelease?: (release: DragRelease) => void
}

export interface StateStyle {
  /** Background of `Box`, `Card` and layouts with a surface. */
  color?: ColorValue
  borderColor?: ColorValue
  opacity?: number
  scale?: number
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
  a11yRole?: A11yRole
  a11yChecked?: boolean
  /** Horizontal placement inside a layout: "start" (default), "center" or "end". */
  align?: "start" | "center" | "end" | "left" | "right"
  /** Cap the width inside a layout (the node stays centered when `align` is "center"). */
  maxWidth?: number
  /** Fade opacity changes over this many milliseconds. */
  animate?: number
  /** Look while the pointer is over the node. */
  hover?: StateStyle
  /** Look while the node is held down. */
  pressed?: StateStyle
  /** Look while `enabled` is false. */
  disabled?: StateStyle
  /** Set to false to ignore input on the node and everything inside it. */
  enabled?: boolean
  /** State the node animates from when it appears or becomes visible. */
  enter?: MotionState
  /** State the node animates to before it is removed or hidden. */
  exit?: MotionState
  /** Timing shared by pressed, enter, exit and the drag spring-back. */
  transition?: MotionTransition
  /** Follow the finger in the renderer and report a release past the threshold. */
  drag?: DragOptions
  minWidth?: number
  minHeight?: number
  maxHeight?: number
  /** Share of the free space along the parent Row or Column. */
  flex?: number
  /** Degrees. */
  rotation?: number
  /** Keep turning, in turns per minute. Runs without JavaScript. */
  spinSpeed?: number
  /** Blur the node and everything in it, by a radius in pixels. */
  blur?: number
  /** Cut off content outside the node's bounds. */
  clip?: boolean
  zIndex?: number
  /** Place the node relative to its parent Stack; offsets are in pixels. */
  absolute?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  /** Receive the measured size after layout. */
  onLayout?: (size: { width: number; height: number }) => void
  onFocus?: () => void
  onBlur?: () => void
  /** Neon glow around the node; `true` uses the theme primary. */
  neon?: boolean | NeonOptions
}

export interface PaddingOptions {
  padding?: number
  paddingX?: number
  paddingY?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}

export interface GlassOptions {
  /** Radius in pixels; the first request in a Stack sets it for all glass there. */
  blur?: number
  /** A color laid over the blur. Use a translucent one. */
  tint?: ColorValue
}

export interface SurfaceOptions {
  /** See-through surface that blurs the first child of the nearest Stack. */
  glass?: GlassOptions
  color?: ColorValue
  hoverColor?: ColorValue
  radius?: number
  borderColor?: ColorValue
  borderWidth?: number
  gradient?: GradientOptions
  elevation?: number
  shadowColor?: ColorValue
  onClick?: () => void
  onLongPress?: () => void
}

export type Justify = "start" | "center" | "end" | "between" | "around" | "evenly"

export type AlignItems = "start" | "center" | "end" | "stretch"

export interface LayoutOptions extends CommonOptions, PaddingOptions, SurfaceOptions {
  gap?: number
  expand?: boolean
  /** How free space is shared along the main axis. */
  justify?: Justify
  /** How children sit on the cross axis, unless a child sets its own `align`. */
  alignItems?: AlignItems
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
  /** Scrolls back to the top whenever this value changes, for a screen that is reused for new content. */
  scrollKey?: string | number
  gap?: number
  padding?: number
  header?: UiChild
  footer?: UiChild
  /** Allow kinetic fling after a drag; false stops the list as soon as the finger lifts. */
  flick?: boolean
  /** Stretch the content at the bottom edge of the list. */
  overscroll?: boolean
  onScroll?: (state: ScrollState) => void
}

export interface WrapOptions extends LayoutOptions {
  align?: "start" | "center" | "end"
}

export interface StackOptions extends CommonOptions, PaddingOptions, SurfaceOptions {
  align?: "start" | "center" | "end"
}

export interface ScrollOptions extends CommonOptions {
  /** Scrolls back to the top whenever this value changes, for a screen that is reused for new content. */
  scrollKey?: string | number
  gap?: number
  padding?: number
  flick?: boolean
  /** Stretch the content at the edges of the list. */
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

export interface CardOptions extends CommonOptions, PaddingOptions {
  color?: ColorValue
  hoverColor?: ColorValue
  radius?: number
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

export interface BoxOptions extends CommonOptions, PaddingOptions, SurfaceOptions {
  expand?: boolean
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
  focusBorderColor?: ColorValue
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

const resolveValue = <T>(value: T | (() => T)): T => {
  return typeof value === "function" ? (value as () => T)() : value
}

const childSlots = (children: UiChild[], prefix = "", out: string[] = []): string[] => {
  const only = children.length === 1 ? children[0] : null
  const items = Array.isArray(only) ? only : children

  items.forEach((child, index) => {
    if (!child) return

    if (Array.isArray(child)) {
      childSlots(child, `${prefix}${index}.`, out)

      return
    }

    if (typeof child === "object") out.push(`${prefix}${index}`)
  })

  return out
}

const flatten = (children: UiChild[], out: UiNode[] = []): UiNode[] => {
  for (const child of children) {
    if (typeof child === "string" || typeof child === "number") {
      console.warn(`[pulsar] text must be inside Text, this was ignored: ${String(child).slice(0, 40)}`)

      continue
    }

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
  const { neon, onLayout, onFocus, onBlur, drag, ...rest } = props as P & {
    neon?: boolean | NeonOptions
    onLayout?: (size: { width: number; height: number }) => void
    onFocus?: () => void
    onBlur?: () => void
    drag?: DragOptions
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

  const release = drag?.onRelease

  if (release) {
    eventList.push("dragRelease")
    callbackMap.dragRelease = (value) => release(value as DragRelease)
  }

  const node: UiNode = { id, type, props: rest as Record<string, unknown> }
  const nodes = flatten(children)

  if (drag) node.props.drag = { axis: drag.axis, threshold: drag.threshold }

  if (Object.keys(callbackMap).length > 0) {
    handlers.set(id, callbackMap)
    node.callbacks = callbackMap
  }

  if (nodes.length > 0) node.children = nodes
  if (eventList.length > 0) node.events = eventList

  const slots = childSlots(children)

  if (slots.some((slot, index) => slot !== String(index))) node.slots = slots

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

const SURFACE_KEYS = [
  "color",
  "hoverColor",
  "radius",
  "borderColor",
  "borderWidth",
  "gradient",
  "glass",
  "elevation",
  "shadowColor",
  "onClick",
  "onLongPress",
]

const INNER_KEYS = ["gap", "justify", "alignItems"]

const STATE_KEYS = ["hover", "pressed", "disabled"]

const hasSurface = (options: object): boolean => {
  const own = options as Record<string, unknown>

  if (SURFACE_KEYS.some((key) => own[key] !== undefined)) return true

  return STATE_KEYS.some((key) => {
    const style = own[key] as StateStyle | undefined

    return style?.color !== undefined || style?.borderColor !== undefined
  })
}

const splitSurface = (options: object) => {
  const outer: Record<string, unknown> = {}
  const inner: Record<string, unknown> = { fillWidth: true, fillHeight: true }

  for (const [key, value] of Object.entries(options)) {
    if (INNER_KEYS.includes(key)) inner[key] = value
    else outer[key] = value
  }

  return { outer, inner }
}

const justifySpacer = (axis: "row" | "column", key: string, flex: number) => {
  return spacer({ key, flex, ...(axis === "row" ? { fillWidth: true } : { fillHeight: true }) })
}

const justifyChildren = (axis: "row" | "column", justify: Justify, children: UiChild[]) => {
  const nodes = flatten(children)
  const slots = childSlots(children)
  const out: UiNode[] = []
  const outSlots: string[] = []
  const edge = 1
  const middle = justify === "around" ? 2 : 1

  const add = (key: string, flex: number) => {
    out.push(justifySpacer(axis, key, flex))
    outSlots.push(key)
  }

  if (justify === "center" || justify === "end" || justify === "around" || justify === "evenly") {
    add("justify-start", edge)
  }

  nodes.forEach((node, index) => {
    out.push(node)
    outSlots.push(slots[index] ?? String(index))

    const inside = index < nodes.length - 1
    const spaced = justify === "between" || justify === "around" || justify === "evenly"

    if (inside && spaced) add(`justify-${slots[index]}`, middle)
  })

  if (justify === "center" || justify === "around" || justify === "evenly") add("justify-end", edge)

  return { nodes: out, slots: outSlots }
}

const justifiedDefaults = (axis: "row" | "column", options: LayoutOptions): LayoutOptions => {
  if (!options.justify || options.justify === "start") return options
  if (options.fill !== undefined || options.expand !== undefined) return options
  if (axis === "row")
    return options.width !== undefined || options.fillWidth !== undefined ? options : { ...options, fillWidth: true }

  return options.height !== undefined || options.fillHeight !== undefined ? options : { ...options, fillHeight: true }
}

const layoutNode = (axis: "row" | "column", options: LayoutOptions, children: UiChild[]): UiNode => {
  const { justify, ...props } = options

  if (!justify || justify === "start") return makeNode(axis, props, children)

  const arranged = justifyChildren(axis, justify, children)
  const node = makeNode(axis, props, arranged.nodes)

  node.slots = arranged.slots

  return node
}

const axisNode = (axis: "row" | "column", options: LayoutOptions, children: UiChild[]): UiNode => {
  const resolved = justifiedDefaults(axis, options)

  if (!hasSurface(resolved)) return layoutNode(axis, resolved, children)

  const { outer, inner } = splitSurface(resolved)

  return withLongPress("box", outer as BoxOptions, [layoutNode(axis, inner as LayoutOptions, children)])
}

export const column = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => {
  return axisNode("column", options, children)
}

export const row = (options: LayoutOptions = {}, ...children: UiChild[]): UiNode => {
  return axisNode("row", options, children)
}

export const wrap = (options: WrapOptions = {}, ...children: UiChild[]): UiNode => {
  if (!hasSurface(options)) return makeNode("wrap", options, children)

  const { outer, inner } = splitSurface(options)

  return withLongPress("box", outer as BoxOptions, [makeNode("wrap", inner, children)])
}

export const stack = (options: StackOptions = {}, ...children: UiChild[]): UiNode => {
  if (!hasSurface(options)) return makeNode("stack", options, children)

  const { outer, inner } = splitSurface(options)

  return withLongPress("box", outer as BoxOptions, [makeNode("stack", inner, children)])
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
  options: {
    key?: string
    flex?: number
    size?: number
    width?: number
    height?: number
    fillWidth?: boolean
    fillHeight?: boolean
  } = {},
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
  const { gap = 12, padding = 16, header, footer, flick, overscroll, onScroll, scrollKey, ...props } = options

  return column(
    { ...props, fill: true, gap, padding },
    header ?? null,
    scroll({ fill: true, flick, overscroll, onScroll, scrollKey }, column({ gap, fillWidth: true }, ...children)),
    footer ?? null,
  )
}

export const For = <T>(options: ForOptions<T>): UiNode => {
  const { each, keyOf, render, ...props } = options

  return list({ ...props, items: resolveValue(each), keyOf, render })
}

export type DefinedComponent<P> = (props: P, ...children: UiChild[]) => UiNode

export type ComponentSetup<P> = (props: P, ...children: UiChild[]) => UiNode | (() => UiNode)

type Cleanup = () => void

export interface ComponentInstance {
  props: Record<string, unknown>
  args: UiChild[]
  render: () => UiNode | UiNode[] | null
  computation: Computation
  node: UiNode | UiNode[] | null
  dirty: boolean
  parent: ComponentInstance | null
  depth: number
  instances: Map<unknown, Map<string, ComponentInstance>>
  seen: Set<ComponentInstance>
  calls: Map<unknown, number>
  cleanups: Cleanup[]
  root: UiRoot
  paused: boolean
}

export interface UiRoot {
  instance: ComponentInstance
  dirty: Set<ComponentInstance>
  schedule: () => void
}

let currentInstance: ComponentInstance | null = null

const pendingMounts: Array<{ instance: ComponentInstance; run: () => void | Cleanup }> = []

const createInstance = (root: UiRoot | null, parent: ComponentInstance | null, props: Record<string, unknown>) => {
  const instance: ComponentInstance = {
    props,
    args: [],
    render: () => null,
    computation: new Computation(() => {
      instance.dirty = true

      if (isPaused(instance)) return

      instance.root.dirty.add(instance)
      instance.root.schedule()
    }),
    node: null,
    dirty: true,
    parent,
    depth: parent ? parent.depth + 1 : 0,
    instances: new Map(),
    seen: new Set(),
    calls: new Map(),
    cleanups: [],
    root: (root ?? parent?.root) as UiRoot,
    paused: false,
  }

  return instance
}

const isPaused = (instance: ComponentInstance): boolean => {
  for (let current: ComponentInstance | null = instance; current; current = current.parent) {
    if (current.paused) return true
  }

  return false
}

const resumeInstance = (instance: ComponentInstance): void => {
  if (instance.dirty) {
    instance.root.dirty.add(instance)
    instance.root.schedule()
  }

  for (const group of instance.instances.values()) {
    for (const child of group.values()) resumeInstance(child)
  }
}

const disposeInstance = (instance: ComponentInstance): void => {
  instance.computation.clear()
  instance.root.dirty.delete(instance)
  instance.dirty = false

  for (const group of instance.instances.values()) {
    for (const child of group.values()) disposeInstance(child)
  }

  instance.instances.clear()

  for (const cleanup of instance.cleanups.splice(0)) cleanup()
}

const removeUnseenInstances = (instance: ComponentInstance): void => {
  for (const group of instance.instances.values()) {
    const unseen = [...group].filter(([, child]) => !instance.seen.has(child))

    for (const [id, child] of unseen) {
      disposeInstance(child)
      group.delete(id)
    }
  }
}

const withInstance = <T>(instance: ComponentInstance, fn: () => T): T => {
  const previous = currentInstance

  currentInstance = instance
  instance.seen.clear()
  instance.calls.clear()

  try {
    return instance.computation.run(fn)
  } finally {
    currentInstance = previous
    instance.dirty = false
    instance.root.dirty.delete(instance)
  }
}

const renderInstance = (instance: ComponentInstance): void => {
  const node = withInstance(instance, instance.render)

  if (node && !Array.isArray(node)) {
    node.cacheable = true

    if (instance.props.key !== undefined && node.props.key === undefined) node.props.key = instance.props.key
  }

  instance.node = node
  removeUnseenInstances(instance)
}

const startInstance = <P>(instance: ComponentInstance, setup: ComponentSetup<P>): void => {
  const node = withInstance(instance, () => setup(instance.props as P, ...instance.args))

  if (typeof node === "function") {
    instance.render = node
    renderInstance(instance)

    return
  }

  instance.render = () => setup(instance.props as P, ...instance.args) as UiNode

  if (!Array.isArray(node)) {
    node.cacheable = true

    if (instance.props.key !== undefined && node.props.key === undefined) node.props.key = instance.props.key
  }

  instance.node = node
  removeUnseenInstances(instance)
}

const sameProps = (current: Record<string, unknown>, next: Record<string, unknown>): boolean => {
  const keys = Object.keys(next)

  if (keys.length !== Object.keys(current).length) return false

  for (const key of keys) {
    const value = next[key]

    if (typeof value === "function" && typeof current[key] === "function") continue
    if (!Object.is(current[key], value)) return false
  }

  return true
}

const replaceProps = (current: Record<string, unknown>, next: Record<string, unknown>): void => {
  for (const key of Object.keys(current)) {
    if (!(key in next)) delete current[key]
  }

  Object.assign(current, next)
}

/**
 * Define a component. `setup` runs once per instance and may return a render
 * function, which reruns when anything it read changes; local state lives in
 * the closure. A `setup` that returns a node directly reruns as a whole.
 * Read props through `props` so that they stay current.
 */
export const component = <P>(setup: ComponentSetup<P>): DefinedComponent<P> => {
  return (props, ...children) => {
    const parent = currentInstance

    if (!parent) {
      const result = setup(props, ...children)

      return typeof result === "function" ? result() : result
    }

    const own = { ...(props as Record<string, unknown>) }
    const position = parent.calls.get(setup) ?? 0
    const group = parent.instances.get(setup) ?? new Map<string, ComponentInstance>()
    let id = own.key !== undefined ? `key:${String(own.key)}` : `at:${position}`

    if (children.length > 0) own.children = children

    parent.calls.set(setup, position + 1)
    parent.instances.set(setup, group)

    const existing = group.get(id)

    if (existing && parent.seen.has(existing)) {
      console.warn(`[pulsar] duplicate component key: ${String(own.key)}`)

      id = `${id}#${position}`
    }

    const instance = group.get(id)

    if (!instance) {
      const created = createInstance(null, parent, own)

      created.args = children
      group.set(id, created)
      parent.seen.add(created)
      startInstance(created, setup)

      return created.node as UiNode
    }

    const changed = !sameProps(instance.props, own)

    replaceProps(instance.props, own)
    instance.args = children
    parent.seen.add(instance)

    if ((changed || instance.dirty) && !isPaused(instance)) renderInstance(instance)

    return instance.node as UiNode
  }
}

export interface CanvasContext {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineCap: "butt" | "round" | "square"
  lineJoin: "bevel" | "round" | "miter"
  globalAlpha: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  font: string
  textAlign: "left" | "right" | "center" | "start" | "end"
  textBaseline: "top" | "middle" | "bottom" | "alphabetic"
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  scale(x: number, y: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  arc(x: number, y: number, radius: number, start: number, end: number, counterClockwise?: boolean): void
  rect(x: number, y: number, width: number, height: number): void
  fill(): void
  stroke(): void
  clip(): void
  clearRect(x: number, y: number, width: number, height: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  strokeRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
}

export interface CanvasFrame<P> {
  width: number
  height: number
  /** Seconds since the canvas appeared. */
  time: number
  params: P
  colors: {
    primary: string
    text: string
    textSecondary: string
    background: string
    surface: string
    border: string
  }
}

export interface CanvasOptions<P> extends CommonOptions {
  /**
   * Runs in the renderer, so it cannot read outer variables. Pass data through `params`.
   * Write it as an arrow function.
   */
  draw: (ctx: CanvasContext, frame: CanvasFrame<P>) => void
  params?: P
  /** Redraw on every frame while the canvas is visible. */
  animated?: boolean
  /** Cap the redraw rate of an animated canvas. Defaults to 60; 0 means every frame. */
  fps?: number
}

export const Canvas = <P = Record<string, never>>(options: CanvasOptions<P>): UiNode => {
  const { draw, ...props } = options

  return makeNode("canvas", { ...props, drawSource: draw.toString() })
}

export type ShaderUniform =
  number | ColorValue | "primary" | [number, number] | [number, number, number] | [number, number, number, number]

export interface ShaderOptions extends CommonOptions {
  /** A `.frag` file of the app, relative to its directory. */
  source: string
  /** Values for the `uniform`s the shader declares. A string is a color. */
  uniforms?: Record<string, ShaderUniform>
  /** Stop `time` to draw a still picture. */
  animated?: boolean
}

/** Runs a fragment shader on the GPU. See the UI guide for the short form it is written in. */
export const Shader = (options: ShaderOptions): UiNode => {
  return makeNode("shader", options)
}

const effect = (name: string, defaults: Record<string, ShaderUniform>, options: Record<string, unknown>): UiNode => {
  const uniforms = { ...defaults }
  const rest: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(options)) {
    if (key in defaults) uniforms[key] = value as ShaderUniform
    else rest[key] = value
  }

  return makeNode("shader", { ...rest, source: `qrc:/runtime/shaders/${name}.frag`, uniforms })
}

export interface WaveOptions extends CommonOptions {
  color?: ColorValue
  /** Height of the wave in pixels. */
  amplitude?: number
  /** Number of waves across the width. */
  frequency?: number
  speed?: number
  thickness?: number
  glowRadius?: number
  animated?: boolean
}

/** An animated wave, as in a music player. */
export const Wave = (options: WaveOptions = {}): UiNode => {
  return effect(
    "wave",
    { color: "primary", amplitude: 4, frequency: 6, speed: 3, thickness: 3, glowRadius: 0 },
    options as Record<string, unknown>,
  )
}

export interface LightningOptions extends CommonOptions {
  color?: ColorValue
  /** Start of the bolt, as a share of the width and height. Defaults to the middle left. */
  from?: [number, number]
  /** End of the bolt, as a share of the width and height. Defaults to the middle right. */
  to?: [number, number]
  /** How far along the way the bolt reaches, from 0 to 1. */
  progress?: number
  /** New bolt shapes per second. */
  speed?: number
  /** How far the bolt strays from the middle, in pixels. */
  jitter?: number
  thickness?: number
  glowRadius?: number
  animated?: boolean
}

/** A flickering bolt with a glow. */
export const Lightning = (options: LightningOptions = {}): UiNode => {
  return effect(
    "lightning",
    {
      color: "primary",
      from: [0, 0.5],
      to: [1, 0.5],
      progress: 1,
      speed: 14,
      jitter: 26,
      thickness: 1.5,
      glowRadius: 16,
    },
    options as Record<string, unknown>,
  )
}

export interface AuroraOptions extends CommonOptions {
  color?: ColorValue
  accent?: ColorValue
  speed?: number
  /** Size of the shapes; larger means more and smaller. */
  scale?: number
  animated?: boolean
}

/** A slow flowing background. */
export const Aurora = (options: AuroraOptions = {}): UiNode => {
  return effect(
    "aurora",
    { color: "primary", accent: "#5ce1e6", speed: 0.08, scale: 2.5 },
    options as Record<string, unknown>,
  )
}

export interface ArrangePlacement {
  /** Center of the child, in pixels from the left. */
  x?: number
  /** Center of the child, in pixels from the top. */
  y?: number
  scale?: number
  /** Degrees. */
  rotation?: number
  opacity?: number
  z?: number
}

export interface ArrangeFrame<P> {
  width: number
  height: number
  /** Seconds since it appeared. */
  time: number
  params: P
}

export interface ArrangeOptions<P> extends CommonOptions {
  /**
   * Places each child, in the renderer. It cannot read outer variables, so pass data
   * through `params`. Write it as an arrow function.
   */
  arrange: (index: number, count: number, frame: ArrangeFrame<P>) => ArrangePlacement
  /** Numbers glide to new values over `transition`. */
  params?: P
  /** Run `arrange` on every frame, for layouts that keep moving. */
  animated?: boolean
}

export const Arrange = <P = Record<string, never>>(options: ArrangeOptions<P>, ...children: UiChild[]): UiNode => {
  const { arrange, ...props } = options

  return makeNode("arrange", { ...props, arrangeSource: arrange.toString() }, children)
}

export interface OrbitOptions extends CommonOptions {
  /** Horizontal radius in pixels. */
  radiusX?: number
  /** Vertical radius in pixels. */
  radiusY?: number
  /** Turns per minute. */
  speed?: number
  /** Turn the whole ring, in degrees. Glides over `transition`. */
  spin?: number
  /**
   * How far the ring leans back, from 0 to 1. The far side gets smaller and dimmer. It looks
   * best with `radiusY` about half of `radiusX`.
   */
  depth?: number
}

/** Places children on a ring. They stay ordinary nodes, with clicks and hover. */
export const Orbit = (options: OrbitOptions, ...children: UiChild[]): UiNode => {
  const { radiusX = 120, radiusY = options.radiusX ?? 120, speed = 0, spin = 0, depth = 0, ...props } = options

  return Arrange(
    {
      ...props,
      animated: speed !== 0,
      params: { radiusX, radiusY, speed, spin, depth },
      arrange: (index, count, { width, height, time, params }) => {
        const angle = (index / count) * 6.2831853 + ((params.spin + (time * params.speed * 360) / 60) * 3.1415927) / 180
        const near = (Math.sin(angle) + 1) / 2

        return {
          x: width / 2 + Math.cos(angle) * params.radiusX,
          y: height / 2 + Math.sin(angle) * params.radiusY,
          scale: 1 - params.depth * (1 - near),
          opacity: 1 - params.depth * 1.3 * (1 - near),
          z: near,
        }
      },
    },
    ...children,
  )
}

export interface KeepAliveOptions extends CommonOptions, PaddingOptions, SurfaceOptions {
  /** Show the content. It is built the first time this is true and kept after that. */
  active: boolean
  /** Build the content while hidden, so that the first opening is instant too. */
  preload?: boolean
}

interface KeepAliveHolder {
  instance: ComponentInstance | null
}

const KeepAliveContent = component<{ holder: KeepAliveHolder; render: () => UiNode }>((props) => {
  props.holder.instance = currentInstance

  return () => props.render()
})

const KeepAliveFrame = component<KeepAliveOptions & { render: () => UiNode }>((props) => {
  const holder: KeepAliveHolder = { instance: null }

  let started = false

  return () => {
    const { active, preload, render, ...options } = props

    if (!active && !preload && !started) return null as unknown as UiNode

    started = true

    const content = holder.instance

    if (content && content.paused === active) {
      content.paused = !active

      if (active) resumeInstance(content)
    }

    const body = KeepAliveContent({ holder, render })

    if (!content && holder.instance) holder.instance.paused = !active

    return Box({ fill: true, ...options, visible: active }, body)
  }
})

/**
 * Keep a screen alive while it is hidden, so that it opens again at once with its
 * scroll and input intact. Content is built on first use, and while hidden it only
 * records changes, which are applied when it is shown again.
 */
export const KeepAlive = (options: KeepAliveOptions, render: () => UiNode): UiNode => {
  return KeepAliveFrame({ ...options, render })
}

/** Run after this component's first render has reached the host; may return a cleanup. */
export const onMount = (run: () => void | Cleanup): void => {
  if (!currentInstance) throw new Error("onMount must be called while setting up a component")

  pendingMounts.push({ instance: currentInstance, run })
}

/** Run when this component leaves the tree. */
export const onCleanup = (cleanup: Cleanup): void => {
  if (!currentInstance) throw new Error("onCleanup must be called while setting up a component")

  currentInstance.cleanups.push(cleanup)
}

export const runPendingMounts = (): void => {
  for (const { instance, run } of pendingMounts.splice(0)) {
    const cleanup = run()

    if (cleanup) instance.cleanups.push(cleanup)
  }
}

export const createUiRoot = (render: () => UiNode[], schedule: () => void): UiRoot => {
  const root = { dirty: new Set(), schedule } as unknown as UiRoot

  root.instance = createInstance(root, null, {})
  root.instance.render = render
  root.dirty.add(root.instance)

  return root
}

export const disposeUiRoot = (root: UiRoot): void => {
  disposeInstance(root.instance)
}

export const renderUiRoot = (root: UiRoot): UiNode[] => {
  renderInstance(root.instance)

  return (root.instance.node ?? []) as UiNode[]
}

const invalidateInstance = (instance: ComponentInstance): void => {
  instance.computation.invalidate()

  for (const group of instance.instances.values()) {
    for (const child of group.values()) invalidateInstance(child)
  }
}

/** Mark every component of this root for a rerender. */
export const invalidateUiRoot = (root: UiRoot): void => {
  invalidateInstance(root.instance)
}

export interface UiRootUpdate {
  patches: UiPatch[]
  removedRoutes: string[]
  routes: UiRoutes
  removedIDs: number[]
  ids: number[]
}

/** Rerender the dirty components in place; null means the root must rerender. */
export const updateUiRoot = (root: UiRoot): UiRootUpdate | null => {
  if (root.instance.dirty) return null

  const update: UiRootUpdate = { patches: [], removedRoutes: [], routes: {}, removedIDs: [], ids: [] }
  const dirty = [...root.dirty].sort((a, b) => a.depth - b.depth)

  for (const instance of dirty) {
    if (!instance.dirty) continue

    const previous = instance.node as UiNode | null

    if (Array.isArray(previous)) return null

    const before = previous?.serialized

    if (!before || !previous) return null

    renderInstance(instance)

    const next = instance.node as UiNode | null

    if (!next || Array.isArray(next)) return null
    if (next === previous) continue

    const out = serializeNode(next, before.path)
    const old = previous.collected
    const collected = collectNode(next, before.path)

    diffNode(before.out as unknown as SerializedUiNode, out as unknown as SerializedUiNode, update.patches)

    for (const key of Object.keys(before.out)) delete before.out[key]

    Object.assign(before.out, out)
    next.serialized = { path: before.path, out: before.out }

    if (old) {
      update.removedRoutes.push(...Object.keys(old.routes))
      update.removedIDs.push(...old.ids)
    }

    Object.assign(update.routes, collected.routes)
    update.ids.push(...collected.ids)
  }

  return update
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

export const Radio = (first: string | (RadioOptions & { label?: string }) = {}, options: RadioOptions = {}): UiNode => {
  if (typeof first === "string") return radio(first, options)

  const { label = "", ...rest } = first

  return radio(label, rest)
}

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

export const Spacer = spacer
export const Divider = divider
export const Image = image
export const Avatar = (options: AvatarOptions = {}): UiNode => avatar(options)
export const Badge = (options: BadgeOptions = {}): UiNode => badge(options)
export const Skeleton = (options: SkeletonOptions = {}): UiNode => skeleton(options)
export const Spinner = (options: SpinnerOptions = {}): UiNode => spinner(options)
const nodeSegment = (node: UiNode, index: number, keys?: Array<string | number>, slots?: string[]): string => {
  const explicit = node.props.key

  if (explicit !== undefined) return String(explicit)
  if (keys) return String(keys[index] ?? index)

  return slots?.[index] ?? String(index)
}

const serializeNode = (node: UiNode, path: string): Record<string, unknown> => {
  if (node.cacheable && node.serialized?.path === path) return node.serialized.out

  const out: Record<string, unknown> = { id: node.id, type: node.type, props: node.props, path }

  if (node.children) {
    const childKeys = node.type === "list" ? (node.props.itemKeys as Array<string | number> | undefined) : undefined

    out.children = serialize(node.children, path, childKeys, node.slots)
  }

  if (node.events) out.events = node.events
  if (node.cacheable) node.serialized = { path, out }

  return out
}

export const serialize = (
  nodes: UiNode[],
  parentPath = "",
  keys?: Array<string | number>,
  slots?: string[],
): unknown[] => {
  return nodes.map((node, index) => serializeNode(node, `${parentPath}/${nodeSegment(node, index, keys, slots)}`))
}

export interface UiPatch {
  path: string
  node: Record<string, unknown>
  shallow?: boolean
}

type SerializedUiNode = {
  id: number
  type: string
  props: Record<string, unknown>
  path: string
  children?: SerializedUiNode[]
  events?: string[]
}

const sameChildPaths = (a: SerializedUiNode, b: SerializedUiNode): boolean => {
  const aChildren = a.children ?? []
  const bChildren = b.children ?? []

  if (aChildren.length !== bChildren.length) return false

  for (let index = 0; index < aChildren.length; index++) {
    if (aChildren[index]!.path !== bChildren[index]!.path) return false
  }

  return true
}

const sameOwnProps = (a: SerializedUiNode, b: SerializedUiNode): boolean => {
  if (a.type !== b.type) return false
  if (JSON.stringify(a.events ?? []) !== JSON.stringify(b.events ?? [])) return false

  return JSON.stringify(a.props) === JSON.stringify(b.props)
}

const diffNode = (previous: SerializedUiNode, next: SerializedUiNode, patches: UiPatch[]): boolean => {
  if (previous === next) return true

  const ownChanged = !sameOwnProps(previous, next)

  if (!sameChildPaths(previous, next)) {
    patches.push({ path: next.path, node: next as unknown as Record<string, unknown> })

    return true
  }

  if (ownChanged) {
    const { children: _children, ...own } = next

    patches.push({ path: next.path, node: own as unknown as Record<string, unknown>, shallow: true })
  }

  const previousChildren = previous.children ?? []
  const nextChildren = next.children ?? []

  for (let index = 0; index < nextChildren.length; index++) {
    if (!diffNode(previousChildren[index]!, nextChildren[index]!, patches)) return false
  }

  return true
}

export const diffUiTrees = (previous: unknown[], next: unknown[]): UiPatch[] | null => {
  if (previous.length !== next.length) return null

  const patches: UiPatch[] = []

  for (let index = 0; index < next.length; index++) {
    const before = previous[index] as SerializedUiNode
    const after = next[index] as SerializedUiNode

    if (before.path !== after.path) return null
    if (!diffNode(before, after, patches)) return null
  }

  return patches
}

export const dispatchUiEvent = (id: number, event: string, value: unknown): void => {
  handlers.get(id)?.[event]?.(value)
}

/** Drop the callbacks of nodes that are no longer in the tree. */
export const forgetHandlers = (ids: number[]): void => {
  for (const id of ids) handlers.delete(id)
}

const windowHandlers = new Map<string, Record<string, Record<string, UiHandler>>>()

export const setWindowHandlers = (target: string, routes: UiRoutes): void => {
  windowHandlers.set(target, routes)
}

export const dispatchWindowEvent = (target: string, path: string, event: string, value: unknown): void => {
  windowHandlers.get(target)?.[path]?.[event]?.(value)
}

const collectNode = (node: UiNode, path: string): { routes: UiRoutes; ids: number[] } => {
  if (node.cacheable && node.collected?.path === path) return node.collected

  const routes: UiRoutes = {}
  const callbacks = node.callbacks ?? handlers.get(node.id)
  const ids = [node.id]

  if (callbacks) routes[path] = callbacks

  if (node.children) {
    const childKeys = node.type === "list" ? (node.props.itemKeys as Array<string | number> | undefined) : undefined
    const child = collectUiHandlers(node.children, path, childKeys, node.slots)

    Object.assign(routes, child.routes)
    ids.push(...child.ids)
  }

  if (node.cacheable) node.collected = { path, routes, ids }

  return { routes, ids }
}

export const collectUiHandlers = (
  nodes: UiNode[],
  parentPath = "",
  keys?: Array<string | number>,
  slots?: string[],
): { routes: UiRoutes; ids: number[] } => {
  const routes: UiRoutes = {}
  const ids: number[] = []

  nodes.forEach((node, index) => {
    const collected = collectNode(node, `${parentPath}/${nodeSegment(node, index, keys, slots)}`)

    Object.assign(routes, collected.routes)
    ids.push(...collected.ids)
  })

  return { routes, ids }
}
