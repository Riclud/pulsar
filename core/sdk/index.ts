export { App, Store, WindowHandle } from "./app.ts"
export { computed, createState, effect, signal, untracked } from "./reactive.ts"
export type { Computed, Signal } from "./reactive.ts"
export type { AppConfig, EventHandler, PulsarEventMap, KnownEvent, UiSource, UiTimings } from "./app.ts"
export {
  component,
  KeepAlive,
  Canvas,
  Arrange,
  Orbit,
  Shader,
  Wave,
  Lightning,
  Aurora,
  onCleanup,
  onMount,
  diffUiTrees,
  dispatchUiEvent,
  dispatchWindowEvent,
  For,
  Column,
  Row,
  Wrap,
  Stack,
  Page,
  Box,
  Scroll,
  Grid,
  VirtualList,
  Card,
  Header,
  Text,
  Button,
  Icon,
  IconButton,
  Chip,
  Input,
  TextArea,
  Checkbox,
  Switch,
  Slider,
  RangeSlider,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  Progress,
  Menu,
  Accordion,
  AccordionSection,
  Fab,
  Toolbar,
  EmptyState,
  Neon,
  Qml,
  NavBar,
  Container,
  Sheet,
  Pager,
  Tabs,
  NavigationRail,
  Segmented,
  Snackbar,
  Popover,
  Zoomable,
  Spacer,
  Divider,
  Image,
  Avatar,
  Badge,
  Skeleton,
  Spinner,
} from "./ui.ts"
export type {
  A11yRole,
  DragOptions,
  DragRelease,
  MotionState,
  MotionTransition,
  KeepAliveOptions,
  CanvasContext,
  CanvasFrame,
  CanvasOptions,
  ArrangeFrame,
  ArrangeOptions,
  ArrangePlacement,
  OrbitOptions,
  ShaderOptions,
  ShaderUniform,
  WaveOptions,
  LightningOptions,
  AuroraOptions,
  StateStyle,
  UiPatch,
  UiChild,
  UiNode,
  UiNodeType,
  DefinedComponent,
  ForOptions,
  LayoutOptions,
  PageOptions,
  WrapOptions,
  StackOptions,
  ScrollOptions,
  ScrollState,
  ListOptions,
  GridOptions,
  GradientOptions,
  FontWeight,
  VirtualListItem,
  VirtualSwipeAction,
  VirtualListOptions,
  CardOptions,
  AppBarOptions,
  BoxOptions,
  TextOptions,
  ImageOptions,
  AvatarOptions,
  BadgeOptions,
  SkeletonOptions,
  SpinnerOptions,
  ButtonOptions,
  IconOptions,
  IconButtonOptions,
  TextInputOptions,
  KeyboardType,
  CheckboxOptions,
  SliderOptions,
  RangeSliderOptions,
  RadioOptions,
  RadioGroupOption,
  RadioGroupOptions,
  SearchFieldOptions,
  SelectOption,
  SelectOptions,
  ChipOptions,
  SheetOptions,
  PagerOptions,
  NavRailItem,
  NavRailOptions,
  TabItem,
  TabsOptions,
  SegmentedOptions,
  SnackbarOptions,
  PopoverOptions,
  MenuItem,
  MenuOptions,
  AccordionOptions,
  AccordionSectionOptions,
  FabOptions,
  ToolbarOptions,
  EmptyStateOptions,
  NeonOptions,
  QmlOptions,
  NavBarItem,
  NavBarOptions,
  ContainerOptions,
  ZoomableOptions,
  ProgressOptions,
} from "./ui.ts"
export { loadManifest, resolveAppConfig, resolveWindows, setManifest } from "./manifest.ts"
export type { AppManifest, FileAssociation, ManifestWindow } from "./manifest.ts"
export { parseLaunchArgs } from "./launch.ts"
export type { LaunchArgs } from "./launch.ts"
export { CSS_COLOR_NAMES, defineTheme, isColorName } from "./theme.ts"
export { catppuccin, catppuccinFrappe, catppuccinLatte, catppuccinTheme } from "./themes/catppuccin.ts"
export type { CatppuccinFlavor, CatppuccinPalette } from "./themes/catppuccin.ts"
export type { ColorName, ColorValue, Theme, ThemeMotion } from "./theme.ts"

/**
 * Built-in token names come from the Catppuccin presets. Augment this interface
 * from the app to add custom tokens with strict typing and autocomplete.
 *
 *   declare module "pulsar" {
 *     interface ThemeColors {
 *       brand: string
 *       ink: string
 *     }
 *   }
 */
export interface ThemeColors {
  rosewater: string
  flamingo: string
  pink: string
  mauve: string
  red: string
  maroon: string
  peach: string
  yellow: string
  green: string
  teal: string
  sky: string
  sapphire: string
  blue: string
  lavender: string
  text: string
  subtext: string
  overlay: string
  surface: string
  base: string
  mantle: string
  crust: string
}
export type ThemeColor = keyof ThemeColors
export { Router, createRouter } from "./nav.ts"
export { direction, getLocale, getMessages, interpolate, plural, setLocale, setMessages, t, translate } from "./i18n.ts"
export type { PluralForms } from "./i18n.ts"
export { email, isValid, max, maxLength, min, minLength, number, pattern, required, validate } from "./validate.ts"
export type { ValidationResult, ValidationRule } from "./validate.ts"
export type { Route, RouterState, RouterScreen, RouterOptions } from "./nav.ts"
export { hostInfo } from "./caps.ts"
export type { HostInfo } from "./caps.ts"
export { runMigrations } from "./migrations.ts"
export type { Migration, MigrationOptions, MigrationStore } from "./migrations.ts"
export { Breakpoints, createBreakpoints, responsive } from "./responsive.ts"
export type { BreakpointPoints, BreakpointState, BreakpointsOptions, BreakpointValue } from "./responsive.ts"
export { CAPABILITY_PERMISSIONS, capabilityPermission, createPermissionGate } from "./permissions.ts"
export {
  dialog,
  fs,
  fsWatchInternals,
  notify,
  paths,
  screen,
  secureStorage,
  shell,
  storage,
  system,
  theme,
  tray,
  clipboard,
  device,
  permissions,
  share,
  assertCapability,
  callCapability,
  hasCapability,
  listCapabilities,
  registerCapability,
  registerCapabilities,
  setPermissionGate,
} from "./caps.ts"
export { net, NetError } from "./net.ts"
export { MediaManager, media } from "./media.ts"
export type { MediaState, MediaTrack, MediaSnapshot } from "./media.ts"
export type {
  DownloadOptions,
  DownloadResult,
  NetErrorData,
  NetOptions,
  NetRequest,
  NetResponse,
  NetResponseInfo,
} from "./net.ts"
export type {
  AppPaths,
  CapHandler,
  CapRegistry,
  ColorDialogOptions,
  ColorScheme,
  FileDialogOptions,
  FileStat,
  FsEncoding,
  MessageDialogOptions,
  NotificationChannelOptions,
  NotifyOptions,
  Orientation,
  OSPermission,
  ScreenInfo,
  ShareKind,
  ShareOptions,
  SystemLocale,
  ThemeOptions,
  ThemePalette,
  TrayMenuItem,
} from "./caps.ts"
