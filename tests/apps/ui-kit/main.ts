import {
  App,
  Box,
  Card,
  Chip,
  Column,
  Input,
  NavigationRail,
  Progress,
  Row,
  Segmented,
  Slider,
  Switch,
  Text,
  VirtualList,
  catppuccinTheme,
  clipboard,
  device,
  permissions,
  share,
  theme,
  ui,
} from "../../../core/sdk/index.ts"

const app = new App()

const catppuccinOptions = catppuccinTheme("frappe")

void theme.set({
  ...catppuccinOptions,
  colors: { ...catppuccinOptions.colors, brand: "deepskyblue", ink: "#101014" },
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

const Section = (title: string, icon: string, ...children: ReturnType<typeof Column>[]) =>
  Column(
    { gap: 6, fillWidth: true },
    Row(
      { gap: 8, fillWidth: true },
      ui.icon(icon, { size: 20, color: "mauve" }),
      ui.text({ text: title, size: 17, weight: "semibold", color: "text" }),
    ),
    ...children,
  )

const ToggleRow = (label: string, checked: boolean, onToggle: (value: boolean) => void) =>
  Card(
    { padding: 12, fillWidth: true },
    Row(
      { gap: 12, fillWidth: true },
      ui.text({ text: label, size: 15, color: "text" }),
      ui.spacer({ fillWidth: true }),
      ui.switch("", { checked, onToggle }),
    ),
  )

const page = (...children: ReturnType<typeof Column>[]) =>
  Box(
    { color: "surface", radius: 17, borderWidth: 1, borderColor: "overlay", fillWidth: true, fillHeight: true },
    ui.scroll({}, Column({ padding: 16, gap: 16, fillWidth: true }, ...children)),
  )

const quickPage = page(
  ui.text({ text: "Settings", size: 26, weight: "semibold", color: "text" }),
  Section(
    "Appearance",
    "palette",
    ToggleRow("Dark mode", app.store.get("dark") === true, (value) => app.store.set("dark", value)),
    ToggleRow("Background blur", app.store.get("blur") === true, (value) => app.store.set("blur", value)),
  ),
  Section(
    "Accent",
    "colors",
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
  ui.text({ text: "Interface", size: 26, weight: "semibold", color: "text" }),
  Section(
    "Buttons",
    "buttons_alt",
    Row(
      { gap: 8, fillWidth: true },
      ui.button("Solid", { variant: "solid", color: "mauve", textColor: "crust" }),
      ui.button("Soft", { variant: "soft", color: "teal" }),
      ui.button("Outline", { variant: "outline", color: "peach" }),
      ui.button("Ghost", { variant: "ghost", color: "blue" }),
    ),
  ),
  Section(
    "Fields",
    "edit",
    Input({ variant: "filled", placeholder: "Filled field", onInput: (value) => app.store.set("text", value) }),
    Input({ variant: "outline", placeholder: "Outlined field", borderColor: "mauve" }),
  ),
  Section(
    "Progress",
    "linear_scale",
    Progress({ value: 0.6, color: "mauve" }),
    Slider({ value: 40, color: "teal" }),
  ),
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
      ui.text({ text: "Gradient surface", size: 16, weight: "semibold", color: "crust" }),
    ),
    Card(
      { color: "surface", borderColor: "mauve", borderWidth: 1, padding: 16 },
      Row(
        { gap: 10, fillWidth: true },
        Box({ color: "mauve", radius: 999, width: 36, height: 36 }),
        Column(
          { gap: 2, fillWidth: true },
          ui.text({ text: "Pulsar", size: 15, weight: "semibold", color: "text" }),
          ui.text({ text: "Paper Mono · Catppuccin", size: 12, color: "subtext" }),
        ),
      ),
    ),
  ),
)

const kitPage = page(
  ui.text({ text: "Component kit", size: 26, weight: "semibold", color: "text" }),
  Section(
    "Avatars",
    "account_circle",
    Row(
      { gap: 12, fillWidth: true },
      ui.avatar({ name: "Иван Майор", size: 44, status: "online", badge: 3 }),
      ui.avatar({ name: "Макс", size: 36, status: "away" }),
      ui.avatar({ src: "file:///home/user/pulsar/examples/windows/icon.png", name: "Pulsar", size: 44 }),
      ui.avatar({ name: "AI", size: 36, status: "busy", radius: 12 }),
    ),
  ),
  Section(
    "Badges",
    "notifications",
    Row(
      { gap: 12, fillWidth: true },
      ui.badge({ count: 12 }),
      ui.badge({ dot: true }),
      ui.iconButton("notifications", { badge: 5 }),
      ui.iconButton("mail", { badge: "dot" }),
    ),
  ),
  Section(
    "Loading",
    "hourglass",
    Row(
      { gap: 16, fillWidth: true },
      ui.spinner({ size: 24 }),
      ui.spinner({ size: 40, value: 0.6, color: "teal" }),
      ui.skeleton({ variant: "circle", width: 40, height: 40 }),
      ui.skeleton({ variant: "text", width: 180 }),
      ui.skeleton({ variant: "rect", width: 120, height: 48 }),
    ),
  ),
  Section(
    "Bottom sheet",
    "vertical_align_bottom",
    ui.button("Open sheet", { onClick: () => app.store.set("sheet", true) }),
  ),
  Section(
    "Virtual list",
    "list",
    VirtualList({
      items: [
        { key: "a", title: "Alpha", subtitle: "section A", section: "A" },
        { key: "b", title: "Beta", subtitle: "section A", trailing: "2", section: "A" },
        { key: "c", title: "Gamma", subtitle: "section B", section: "B" },
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
    "Switches",
    "toggle_on",
    Row(
      { gap: 12, fillWidth: true },
      Switch({ label: "Enabled", checked: true }),
      Switch({ label: "Disabled", checked: false }),
    ),
  ),
  ui.bottomSheet(
    {
      open: app.store.get("sheet") === true,
      title: "Actions",
      placement: "bottom",
      onClose: () => app.store.set("sheet", false),
    },
    ui.text({ text: "Pick an action", color: "subtext" }),
    ui.button("Share", { variant: "soft", color: "blue", onClick: () => app.store.set("sheet", false) }),
    ui.button("Delete", { variant: "soft", color: "red", onClick: () => app.store.set("sheet", false) }),
  ),
  Section(
    "Text",
    "text_fields",
    Text({ text: "Bold and *italic*", markdown: true, selectable: true, color: "text" }),
    ui.text({ text: "A very long line that should elide", elide: "right", width: 180, color: "subtext" }),
  ),
)

app.window("main").render(() =>
  NavigationRail(
    {
      items: [
        { label: "Quick", icon: "bolt" },
        { label: "Interface", icon: "palette" },
        { label: "Kit", icon: "widgets" },
      ],
      index: (app.store.get("tab") as number) ?? 0,
      expanded: true,
      onChange: (index) => app.store.set("tab", index),
    },
    quickPage,
    interfacePage,
    kitPage,
  ),
)

app.run()
