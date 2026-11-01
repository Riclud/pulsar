export { App, Store, WindowHandle } from "./app.ts"
export type { AppConfig, EventHandler, PulsarEventMap, KnownEvent, UiSource } from "./app.ts"
export {
  ui,
  bind,
  defineComponent,
  dispatchUiEvent,
  For,
  When,
  Column,
  Row,
  Box,
  Scroll,
  Grid,
  VirtualList,
  Card,
  Header,
  AppBar,
  Text,
  Button,
  Icon,
  IconButton,
  Chip,
  Input,
  TextField,
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
  Sheet,
  Pager,
  Tabs,
  NavigationRail,
  Segmented,
  Snackbar,
  Popover,
  Zoomable,
  Modal,
  List,
  Spacer,
  Divider,
  Image,
  Avatar,
  Badge,
  Skeleton,
  Spinner,
  BottomSheet,
} from "./ui.ts"
export type {
  UiChild,
  UiNode,
  UiNodeType,
  DefinedComponent,
  ForOptions,
  WhenOptions,
  LayoutOptions,
  ScrollOptions,
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
 * Custom named colors are opt-in: augment this interface from the app to get
 * strict typing and autocomplete for `theme.set({ colors: ... })` tokens.
 *
 *   declare module "pulsar" {
 *     interface ThemeColors {
 *       brand: string
 *       ink: string
 *     }
 *   }
 */
export interface ThemeColors {}
export type ThemeColor = keyof ThemeColors
export { Router, createRouter } from "./nav.ts"
export type { Route, RouterState, RouterScreen, RouterOptions } from "./nav.ts"
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
