import {
  Accordion,
  AccordionSection,
  App,
  Box,
  Card,
  Chip,
  Column,
  Fab,
  Input,
  Menu,
  NavigationRail,
  Progress,
  RadioGroup,
  RangeSlider,
  Row,
  SearchField,
  Segmented,
  Slider,
  Switch,
  Text,
  Toolbar,
  Container,
  EmptyState,
  NavBar,
  VirtualList,
  catppuccinTheme,
  createBreakpoints,
  clipboard,
  device,
  permissions,
  share,
  theme,
  Avatar,
  Badge,
  Button,
  Icon,
  IconButton,
  Scroll,
  Sheet,
  Skeleton,
  Spacer,
  Spinner,
} from "../../../core/sdk/index.ts"

const app = new App()

const catppuccinOptions = catppuccinTheme("frappe")
const breakpoints = createBreakpoints(app)

let currentDensity = 1

const applyTheme = (density: number) => {
  void theme.set({
    ...catppuccinOptions,
    density,
    colors: { ...catppuccinOptions.colors, brand: "deepskyblue", ink: "#101014" },
  })
}

applyTheme(currentDensity)

breakpoints.subscribe(() => {
  const density = breakpoints.is("compact") ? 0.92 : 1

  if (density === currentDensity) return

  currentDensity = density
  applyTheme(density)
})

void clipboard.write("pulsar")
void clipboard.read()
void device.setKeepAwake(false)
void device.setOrientation("auto")
void share.text("hello from ui-kit")
void permissions.check("camera").then((granted) => app.store.set("permission", granted))
void permissions.request("camera").then((granted) => app.store.set("permissionRequest", granted))

app.store.set("tab", 0)
app.store.set("page", 0)
app.store.set("segment", 0)
app.store.set("text", "")
app.store.set("sheet", false)
app.store.set("dark", true)
app.store.set("blur", true)
app.store.set("radio", "daily")
app.store.set("range", { from: 20, to: 80 })
app.store.set("query", "")
app.store.set("menu", false)
app.store.set("presses", 0)

const Section = (title: string, icon: string, ...children: ReturnType<typeof Column>[]) =>
  Column(
    { gap: 6, fillWidth: true },
    Row(
      { gap: 8, fillWidth: true },
      Icon({ name: icon, size: 20, color: "mauve" }),
      Text({ text: title, size: 17, weight: "semibold", color: "text" }),
    ),
    ...children,
  )

const ToggleRow = (label: string, checked: boolean, onToggle: (value: boolean) => void) =>
  Card(
    { padding: 12, fillWidth: true },
    Row(
      { gap: 12, fillWidth: true },
      Text({ text: label, size: 15, color: "text" }),
      Spacer({ fillWidth: true }),
      Switch({ checked, onToggle }),
    ),
  )

const page = (...children: ReturnType<typeof Column>[]) =>
  Box(
    { color: "surface", radius: 17, borderWidth: 1, borderColor: "overlay", fillWidth: true, fillHeight: true },
    Scroll({}, Column({ padding: 16, gap: 16, fillWidth: true }, ...children)),
  )

const quickPage = page(
  Text({ text: "Settings", size: 26, weight: "semibold", color: "text" }),
  Section(
    "Appearance",
    "palette",
    ToggleRow("Dark mode", app.store.get("dark") === true, (value) => app.store.set("dark", value)),
    ToggleRow("Background blur", app.store.get("blur") === true, (value) => app.store.set("blur", value)),
  ),
  Section(
    "Accent",
    "color_lens",
    Row(
      { gap: 8, fillWidth: true },
      Chip({ label: "Mauve", selected: true, selectedColor: "mauve", textColor: "crust" }),
      Chip({ label: "Blue", variant: "outline", color: "blue" }),
      Chip({ label: "Peach", variant: "soft", color: "peach" }),
      Chip({ label: "Teal", variant: "outline", color: "teal" }),
    ),
  ),
  Section(
    "Density",
    "tune",
    Segmented({
      items: ["Compact", "Comfort", "Spacious"],
      value: 1,
      onChange: (index) => app.store.set("segment", index),
    }),
  ),
)

const interfacePage = page(
  Text({ text: "Interface", size: 26, weight: "semibold", color: "text" }),
  Section(
    "Buttons",
    "buttons_alt",
    Row(
      { gap: 8, fillWidth: true },
      Button({ variant: "solid", color: "mauve", textColor: "crust" }, "Solid"),
      Button({ variant: "soft", color: "teal" }, "Soft"),
      Button({ variant: "outline", color: "peach" }, "Outline"),
      Button({ variant: "ghost", color: "blue" }, "Ghost"),
    ),
  ),
  Section(
    "Fields",
    "edit",
    Input({ variant: "filled", placeholder: "Filled field", onInput: (value) => app.store.set("text", value) }),
    Input({ variant: "outline", placeholder: "Outlined field", borderColor: "mauve" }),
  ),
  Section("Progress", "linear_scale", Progress({ value: 0.6, color: "mauve" }), Slider({ value: 40, color: "teal" })),
  Section(
    "Cards",
    "layers",
    Card(
      {
        gradient: { from: "blue", to: "mauve", direction: "horizontal" },
        borderWidth: 1,
        borderColor: "overlay",
        padding: 16,
      },
      Text({ text: "Gradient surface", size: 16, weight: "semibold", color: "crust" }),
    ),
    Card(
      { color: "surface", borderColor: "mauve", borderWidth: 1, padding: 16 },
      Row(
        { gap: 10, fillWidth: true },
        Box({ color: "mauve", radius: 999, width: 36, height: 36 }),
        Column(
          { gap: 2, fillWidth: true },
          Text({ text: "Pulsar", size: 15, weight: "semibold", color: "text" }),
          Text({ text: "Paper Mono · Catppuccin", size: 12, color: "subtext" }),
        ),
      ),
    ),
  ),
)

const formsPage = page(
  Text({ text: "Forms", size: 26, weight: "semibold", color: "text" }),
  Section(
    "Search",
    "search",
    SearchField({
      value: app.store.get("query") as string,
      placeholder: "Search components",
      debounce: 250,
      onInput: (value) => app.store.set("query", value),
      onSubmit: (value) => app.store.set("query", value),
    }),
  ),
  Section(
    "Radio",
    "radio_button_checked",
    RadioGroup({
      options: [
        { value: "daily", label: "Daily" },
        { value: "weekly", label: "Weekly" },
        { value: "monthly", label: "Monthly" },
      ],
      value: app.store.get("radio") as string,
      onChange: (value) => app.store.set("radio", value),
    }),
  ),
  Section(
    "Range",
    "linear_scale",
    RangeSlider({
      min: 0,
      max: 100,
      from: (app.store.get("range") as { from: number }).from,
      to: (app.store.get("range") as { to: number }).to,
      color: "teal",
      onChange: (from, to) => app.store.set("range", { from, to }),
    }),
  ),
  Section(
    "Accordion",
    "expand_more",
    Accordion(
      { multiple: false },
      AccordionSection(
        { title: "Appearance", subtitle: "Theme, colours, motion", icon: "palette", defaultOpen: true },
        Text({ text: "Catppuccin Frappe with Paper Mono.", color: "subtext" }),
        Switch({ label: "Transparency", checked: true }),
      ),
      AccordionSection(
        { title: "Notifications", icon: "notifications" },
        Text({ text: "Desktop and Android notifications.", color: "subtext" }),
        Switch({ label: "Enabled", checked: true }),
      ),
    ),
  ),
  Section(
    "Toolbar",
    "view_agenda",
    Toolbar(
      {},
      IconButton({ icon: "arrow_back" }),
      Text({ text: "Inbox", size: 16, weight: "semibold", color: "text" }),
      Spacer({ fillWidth: true }),
      IconButton({ icon: "refresh" }),
      IconButton({ icon: "more_vert", onClick: () => app.store.set("menu", true) }),
    ),
  ),
  Section(
    "Empty state",
    "inbox",
    Card(
      { padding: 8, fillWidth: true },
      EmptyState({
        icon: "inbox",
        title: "Nothing here yet",
        text: "Messages you receive will show up in this list.",
        action: Button({ variant: "soft", color: "mauve" }, "Refresh"),
      }),
    ),
  ),
  Section(
    "Elevation",
    "layers",
    Card(
      { padding: 16, elevation: 4, fillWidth: true },
      Text({ text: "Elevated card", size: 15, weight: "semibold", color: "text" }),
    ),
    Row(
      { gap: 8, fillWidth: true },
      Button({ variant: "elevated", color: "mauve", textColor: "crust" }, "Elevated"),
      Button({ variant: "solid", color: "teal" }, "Flat"),
    ),
  ),
  Menu({
    open: app.store.get("menu") === true,
    items: [
      { id: "rename", label: "Rename", icon: "edit" },
      { id: "duplicate", label: "Duplicate", icon: "content_copy", shortcut: "Ctrl+D" },
      { id: "sep", label: "", separator: true },
      { id: "archive", label: "Archive", icon: "archive" },
      { id: "delete", label: "Delete", icon: "delete", danger: true },
    ],
    onSelect: (id) => app.store.set("menuAction", id),
    onClose: () => app.store.set("menu", false),
  }),
  Fab({
    icon: "add",
    color: "mauve",
    textColor: "crust",
    onClick: () => app.store.set("presses", (app.store.get("presses") as number) + 1),
  }),
)

const kitPage = page(
  Text({ text: "Component kit", size: 26, weight: "semibold", color: "text" }),
  Section(
    "Avatars",
    "account_circle",
    Row(
      { gap: 12, fillWidth: true },
      Avatar({ name: "Иван Майор", size: 44, status: "online", badge: 3 }),
      Avatar({ name: "Макс", size: 36, status: "away" }),
      Avatar({ name: "Pulsar", size: 44 }),
      Avatar({ name: "AI", size: 36, status: "busy", radius: 12 }),
    ),
  ),
  Section(
    "Badges",
    "notifications",
    Row(
      { gap: 12, fillWidth: true },
      Badge({ count: 12 }),
      Badge({ dot: true }),
      IconButton({ icon: "notifications", badge: 5 }),
      IconButton({ icon: "mail", badge: "dot" }),
    ),
  ),
  Section(
    "Loading",
    "hourglass",
    Row(
      { gap: 16, fillWidth: true },
      Spinner({ size: 24 }),
      Spinner({ size: 40, value: 0.6, color: "teal" }),
      Skeleton({ variant: "circle", width: 40, height: 40 }),
      Skeleton({ variant: "text", width: 180 }),
      Skeleton({ variant: "rect", width: 120, height: 48 }),
    ),
  ),
  Section(
    "Bottom sheet",
    "vertical_align_bottom",
    Button({ onClick: () => app.store.set("sheet", true) }, "Open sheet"),
  ),
  Section(
    "Virtual list",
    "list",
    VirtualList({
      items: [
        { key: "a", title: "Alpha", subtitle: "section A", section: "A" },
        { key: "b", title: "Beta", subtitle: "section A", trailing: "2", section: "A" },
        { key: "c", title: "Gamma", subtitle: "section B", section: "B" },
        { key: "d", title: "Delta", subtitle: "section B", section: "B" },
        { key: "e", title: "Epsilon", subtitle: "section B", section: "B" },
        { key: "f", title: "Zeta", subtitle: "section C", section: "C" },
        { key: "g", title: "Eta", subtitle: "section C", section: "C" },
        { key: "h", title: "Theta", subtitle: "section C", section: "C" },
      ],
      height: 210,
      fillHeight: false,
      selectable: true,
      stickySections: true,
      swipeActions: [{ id: "delete", icon: "delete", label: "Delete" }],
      onSelect: () => {},
      onPress: () => {},
      onAction: () => {},
      onEndReached: () => {},
      onRefresh: () => {},
      onReorder: () => {},
      reorderable: true,
      refreshable: true,
    }),
  ),
  Section(
    "Neon",
    "auto_awesome",
    Column(
      { gap: 16, fillWidth: true },
      Box(
        {
          color: "mauve",
          radius: 14,
          padding: 16,
          width: 190,
          neon: { color: "mauve", intensity: 1.05, glow: 0.9, padding: 26 },
        },
        Column(
          { gap: 4 },
          Text({ text: "Neon card", size: 16, weight: "semibold", color: "crust" }),
          Text({ text: "soft glow", size: 12, color: "crust" }),
        ),
      ),
      Column(
        { gap: 14, fillWidth: true },
        Text({
          text: "Neon text",
          size: 24,
          weight: "bold",
          color: "cyan",
          neon: { color: "cyan", intensity: 1.1, glow: 0.9, padding: 20 },
        }),
        Row(
          { gap: 10, fillWidth: true },
          Button({
            variant: "solid",
            color: "teal",
            textColor: "crust",
            neon: { color: "teal", intensity: 1.15, glow: 0.9, padding: 22 },
          }, "Glow"),
          Icon({ name: "bolt", size: 28,
            color: "pink",
            neon: { color: "pink", intensity: 1.2, glow: 1, padding: 18 },
          }),
        ),
      ),
    ),
  ),
  Section(
    "Switches",
    "toggle_on",
    Row(
      { gap: 12, fillWidth: true },
      Switch({ label: "Enabled", checked: true }),
      Switch({ label: "Disabled", checked: false }),
    ),
  ),
  Sheet({ placement: "bottom", open: app.store.get("sheet") === true,
      title: "Actions",
      onClose: () => app.store.set("sheet", false),
    }, Text({ text: "Pick an action", color: "subtext" }), Button({ variant: "soft", color: "blue", onClick: () => app.store.set("sheet", false) }, "Share"), Button({ variant: "soft", color: "red", onClick: () => app.store.set("sheet", false) }, "Delete")),
  Section(
    "Text",
    "text_fields",
    Text({ text: "Bold and *italic*", markdown: true, selectable: true, color: "text" }),
    Text({ text: "A very long line that should elide", elide: "right", width: 180, color: "subtext" }),
  ),
)

const navItems = [
  { label: "Quick", icon: "bolt" },
  { label: "Interface", icon: "palette" },
  { label: "Forms", icon: "edit_note" },
  { label: "Kit", icon: "widgets" },
]

const pages = [quickPage, interfacePage, formsPage, kitPage]

app.window("main").render(() => {
  const breakpoint = app.store.get("breakpoint") as { name: string } | null
  const compact = breakpoint === null || breakpoint.name === "compact"
  const index = Math.min(pages.length - 1, Math.max(0, (app.store.get("tab") as number) ?? 0))
  const onChange = (value: number) => app.store.set("tab", value)

  if (compact) {
    return Column(
      { fill: true, gap: 8, padding: 8 },
      Container({ maxWidth: 720, padding: 0, fillHeight: true, gap: 8 }, pages[index]!),
      NavBar({ items: navItems, value: index, onChange }),
    )
  }

  return NavigationRail(
    {
      items: navItems,
      index,
      expanded: breakpoint?.name === "expanded",
      padding: 8,
      onChange,
    },
    ...pages.map((page) => Container({ maxWidth: 980, padding: 0, fillHeight: true }, page)),
  )
})

app.run()
