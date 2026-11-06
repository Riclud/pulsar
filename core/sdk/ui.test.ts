import { describe, expect, test } from "bun:test"
import {
  Button,
  Arrange,
  Canvas,
  Orbit,
  Wave,
  component,
  Card,
  Checkbox,
  Column,
  For,
  Header,
  Input,
  Page,
  Stack,
  Text,
  Wrap,
  appBar,
  accordion,
  accordionSection,
  avatar,
  badge,
  box,
  button,
  card,
  checkbox,
  chip,
  collectUiHandlers,
  column,
  diffUiTrees,
  dispatchUiEvent,
  dispatchWindowEvent,
  setWindowHandlers,
  emptyState,
  fab,
  forgetHandlers,
  grid,
  iconButton,
  image,
  list,
  container,
  menu,
  navBar,
  navRail,
  neon,
  pager,
  popover,
  progress,
  row,
  radio,
  radioGroup,
  rangeSlider,
  searchField,
  segmented,
  serialize,
  sheet,
  spacer,
  skeleton,
  snackbar,
  spinner,
  tabs,
  text,
  textInput,
  toolbar,
  virtualList,
  zoomable,
} from "./ui.ts"

describe("ui", () => {
  test("serializes a tree without callbacks", () => {
    const tree = column({ gap: 4 }, [text("hi"), button("go", { onClick: () => {} })])
    const out = serialize([tree]) as Array<{ type: string; children: unknown[] }>

    expect(out[0]!.type).toBe("column")
    expect(out[0]!.children.length).toBe(2)
    expect(JSON.stringify(out)).not.toContain("onClick")
  })

  test("dispatches events to the registered callback", () => {
    let clicked = 0
    const node = button("go", { onClick: () => clicked++ })

    dispatchUiEvent(node.id, "click", undefined)
    expect(clicked).toBe(1)

    forgetHandlers([node.id])
    dispatchUiEvent(node.id, "click", undefined)
    expect(clicked).toBe(1)
  })

  test("routes events by window and path", () => {
    let clicked = 0
    const node = button("go", { onClick: () => clicked++ })
    const { routes } = collectUiHandlers([node], "", undefined)

    setWindowHandlers("main", routes)

    dispatchWindowEvent("main", "/0", "click", undefined)
    expect(clicked).toBe(1)

    dispatchWindowEvent("other", "/0", "click", undefined)
    expect(clicked).toBe(1)

    forgetHandlers([node.id])
  })

  test("diffs a changed leaf", () => {
    const before = serialize([column({}, [text("a"), text("b")])])
    const after = serialize([column({}, [text("a"), text("c")])])
    const patches = diffUiTrees(before, after)

    expect(patches?.length).toBe(1)
    expect(patches?.[0]?.path).toBe("/0/1")
    expect(patches?.[0]?.shallow).toBe(true)
    expect((patches?.[0]?.node.props as { text: string }).text).toBe("c")
  })

  test("sends the parent subtree when a child is inserted", () => {
    const before = serialize([column({}, [text("a"), text("b")])])
    const after = serialize([column({}, [text("a"), text("b"), text("c")])])
    const patches = diffUiTrees(before, after)

    expect(patches?.length).toBe(1)
    expect(patches?.[0]?.path).toBe("/0")
    expect((patches?.[0]?.node.children as unknown[]).length).toBe(3)
  })

  test("sends the parent subtree when keyed children reorder", () => {
    const before = serialize([column({}, [text({ text: "a", key: "a" }), text({ text: "b", key: "b" })])])
    const after = serialize([column({}, [text({ text: "b", key: "b" }), text({ text: "a", key: "a" })])])
    const patches = diffUiTrees(before, after)

    expect(patches?.length).toBe(1)
    expect(patches?.[0]?.path).toBe("/0")
  })

  test("returns no patches for an unchanged tree", () => {
    const tree = serialize([column({}, [text("a")])])

    expect(diffUiTrees(tree, tree)).toEqual([])
  })

  test("falls back to a full tree when root children change", () => {
    const before = serialize([text("a")])
    const after = serialize([text("a"), text("b")])

    expect(diffUiTrees(before, after)).toBeNull()
  })

  test("a layout with a surface is wrapped in a box", () => {
    const tree = row({ key: "card", color: "#222", radius: 12, padding: 8, gap: 4, fillWidth: true }, text("a"))

    expect(tree.type).toBe("box")
    expect(tree.props.key).toBe("card")
    expect(tree.props.radius).toBe(12)
    expect(tree.props.padding).toBe(8)
    expect(tree.children?.[0]?.type).toBe("row")
    expect(tree.children?.[0]?.props.gap).toBe(4)
  })

  test("a colored state wraps a layout in a box, and a scale does not", () => {
    expect(row({ hover: { color: "#333" } }, text("a")).type).toBe("box")
    expect(row({ disabled: { borderColor: "#333" } }, text("a")).type).toBe("box")
    expect(row({ pressed: { scale: 0.98 } }, text("a")).type).toBe("row")
  })

  test("justify keeps child paths stable when a sibling appears", () => {
    const paths = (extra: boolean) => {
      const tree = serialize([
        row({ key: "r", justify: "between" }, extra ? text("x") : null, text("a"), text("b")),
      ]) as Array<{ children: Array<{ path: string; type: string }> }>

      return (tree[0]?.children ?? []).filter((child) => child.type === "text").map((child) => child.path)
    }

    expect(paths(false)).toEqual(["/r/1", "/r/2"])
    expect(paths(true)).toEqual(["/r/0", "/r/1", "/r/2"])
  })

  test("justify shares free space with spacers", () => {
    const flexes = (justify: "center" | "end" | "between" | "around" | "evenly") => {
      const tree = row({ justify }, text("a"), text("b"))

      return (tree.children ?? []).map((child) => (child.type === "spacer" ? child.props.flex : child.type))
    }

    expect(flexes("end")).toEqual([1, "text", "text"])
    expect(flexes("center")).toEqual([1, "text", "text", 1])
    expect(flexes("between")).toEqual(["text", 1, "text"])
    expect(flexes("around")).toEqual([1, "text", 2, "text", 1])
    expect(flexes("evenly")).toEqual([1, "text", 1, "text", 1])
  })

  test("a shallow patch does not carry the subtree", () => {
    const tree = (opacity: number) => {
      return serialize([column({ key: "root", opacity }, ...Array.from({ length: 50 }, (_, i) => text(`row ${i}`)))])
    }
    const patches = diffUiTrees(tree(1), tree(0.5))

    expect(patches?.length).toBe(1)
    expect(patches?.[0]?.shallow).toBe(true)
    expect(patches?.[0]?.node.children).toBeUndefined()
  })

  test("a conditional sibling does not move the nodes after it", () => {
    const tree = (header: boolean) => {
      return serialize([column({ key: "root" }, header ? text("header") : null, text("body"))]) as Array<{
        children: Array<{ path: string; type: string }>
      }>
    }
    const handlerPaths = (header: boolean) => {
      const node = column({ key: "root" }, header ? text("header") : null, button("Go", { onClick: () => {} }))

      return Object.keys(collectUiHandlers([node]).routes)
    }

    expect(tree(false)[0]?.children[0]?.path).toBe("/root/1")
    expect(tree(true)[0]?.children[1]?.path).toBe("/root/1")
    expect(handlerPaths(false)).toEqual(handlerPaths(true))
  })

  test("drag keeps its release callback out of the serialized props", () => {
    const releases: unknown[] = []
    const node = box({
      enter: { opacity: 0, y: 12 },
      drag: { axis: "x", threshold: 40, onRelease: (release) => releases.push(release) },
    })
    const [tree] = serialize([node]) as Array<{ props: Record<string, unknown>; events: string[] }>
    const { routes } = collectUiHandlers([node])

    setWindowHandlers("drag", routes)
    dispatchWindowEvent("drag", "/0", "dragRelease", { direction: "left", distance: 50 })

    expect(tree?.props.drag).toEqual({ axis: "x", threshold: 40 })
    expect(tree?.props.enter).toEqual({ opacity: 0, y: 12 })
    expect(tree?.events).toEqual(["dragRelease"])
    expect(releases).toEqual([{ direction: "left", distance: 50 }])
  })

  test("checkbox toggle forwards the value", () => {
    const seen: boolean[] = []
    const node = checkbox("x", { onToggle: (value) => seen.push(value) })

    dispatchUiEvent(node.id, "toggle", true)
    expect(seen).toEqual([true])
  })

  test("uses explicit keys and list item keys in paths", () => {
    const tree = column({ key: "root" }, [
      button("a", { key: "primary" }),
      list({
        items: ["x", "y"],
        keyOf: (value) => value,
        render: (value) => text(value),
      }),
    ])
    const out = serialize([tree]) as Array<{
      path: string
      children: Array<{ path: string; children?: Array<{ path: string }> }>
    }>

    expect(out[0]!.path).toBe("/root")
    expect(out[0]!.children[0]!.path).toBe("/root/primary")
    expect(out[0]!.children[1]!.path).toBe("/root/1")
    expect(out[0]!.children[1]!.children![0]!.path).toBe("/root/1/x")
    expect(out[0]!.children[1]!.children![1]!.path).toBe("/root/1/y")
  })

  test("list renders rows with stable item keys", () => {
    const node = list({
      items: [{ id: "a" }, { id: "b" }],
      keyOf: (item) => item.id,
      render: (item) => text(item.id),
    })

    expect(node.children?.length).toBe(2)
    expect(node.props.itemKeys).toEqual(["a", "b"])
  })

  test("new components forward their events", () => {
    const seen: string[] = []

    const bar = appBar({ title: "Tasks", onBack: () => seen.push("back") })
    const remove = chip("tag", { onRemove: () => seen.push("remove") })
    const editor = sheet({ title: "Edit", onClose: () => seen.push("close") })
    const action = iconButton("add", { onClick: () => seen.push("click") })

    dispatchUiEvent(bar.id, "back", undefined)
    dispatchUiEvent(remove.id, "remove", undefined)
    dispatchUiEvent(editor.id, "close", undefined)
    dispatchUiEvent(action.id, "click", undefined)

    expect(seen).toEqual(["back", "remove", "close", "click"])
  })

  test("progress defaults to indeterminate", () => {
    expect(progress().props.indeterminate).toBe(true)
    expect(progress({ value: 0.5 }).props.indeterminate).toBe(false)
  })

  test("multiline input renders a textArea node", () => {
    const single = textInput({ placeholder: "one" })
    const multi = textInput({ multiline: true, lines: 4 })

    expect(single.type).toBe("textInput")
    expect(multi.type).toBe("textArea")
    expect(multi.props.lines).toBe(4)
  })

  test("text input forwards submit and focus events", () => {
    const seen: string[] = []
    const node = textInput({
      onSubmitted: (value) => seen.push(`submit:${value}`),
      onFocus: () => seen.push("focus"),
      onBlur: () => seen.push("blur"),
    })

    dispatchUiEvent(node.id, "submit", "hello")
    dispatchUiEvent(node.id, "focus", undefined)
    dispatchUiEvent(node.id, "blur", undefined)

    expect(seen).toEqual(["submit:hello", "focus", "blur"])
  })

  test("selectable text uses a text editor node", () => {
    expect(text({ text: "copy me", selectable: true }).type).toBe("selectableText")
    expect(text("plain").type).toBe("text")
  })
})

describe("styling", () => {
  test("text accepts numeric and named typography", () => {
    const node = text({
      text: "Title",
      size: 22,
      weight: "semibold",
      italic: true,
      family: "serif",
      letterSpacing: 1,
      lineHeight: 1.4,
      color: "navy",
    })

    expect(node.props).toMatchObject({
      weight: "semibold",
      italic: true,
      family: "serif",
      letterSpacing: 1,
      lineHeight: 1.4,
      color: "navy",
    })
  })

  test("button carries variant, colors and icon", () => {
    const node = button("Save", {
      variant: "outline",
      size: "lg",
      color: "teal",
      textColor: "white",
      radius: 18,
      icon: "check",
      iconPosition: "right",
      elevation: 2,
    })

    expect(node.props).toMatchObject({
      label: "Save",
      variant: "outline",
      size: "lg",
      color: "teal",
      textColor: "white",
      radius: 18,
      icon: "check",
      iconPosition: "right",
      elevation: 2,
    })
  })

  test("panels carry borders, gradients and elevation", () => {
    const node = card({
      color: "black",
      borderColor: "gold",
      borderWidth: 2,
      elevation: 4,
      gradient: { from: "blue", to: "purple", direction: "horizontal" },
    })

    expect(node.props).toMatchObject({
      color: "black",
      borderColor: "gold",
      borderWidth: 2,
      elevation: 4,
      gradient: { from: "blue", to: "purple", direction: "horizontal" },
    })
  })

  test("input and chip style props survive serialization", () => {
    const field = textInput({ variant: "outline", color: "white", borderColor: "orange", radius: 6 })
    const tag = chip("News", { variant: "outline", selected: true, selectedColor: "gold", textColor: "black" })

    expect(field.type).toBe("textInput")
    expect(field.props).toMatchObject({ variant: "outline", color: "white", borderColor: "orange", radius: 6 })
    expect(tag.props).toMatchObject({ variant: "outline", selected: true, selectedColor: "gold", textColor: "black" })

    const out = serialize([tag]) as Array<{ props: Record<string, unknown> }>

    expect(out[0]!.props.color).toBeUndefined()
    expect(out[0]!.props.selected).toBe(true)
  })
})

describe("small components", () => {
  test("avatar carries source, initials inputs and badge", () => {
    const node = avatar({ src: "file:///me.png", name: "Ivan Mayor", size: 48, status: "online", badge: 3 })

    expect(node.type).toBe("avatar")
    expect(node.props).toMatchObject({
      src: "file:///me.png",
      name: "Ivan Mayor",
      size: 48,
      status: "online",
      badge: 3,
    })
  })

  test("badge pill and dot variants", () => {
    expect(badge({ count: 12 }).props).toEqual({ count: 12 })
    expect(badge({ dot: true }).props).toEqual({ dot: true })
  })

  test("skeleton and spinner defaults", () => {
    expect(skeleton({ variant: "text" }).props).toEqual({ variant: "text" })
    expect(spinner().props.value).toBe(-1)
    expect(spinner({ value: 0.4 }).props.value).toBe(0.4)
  })

  test("bottom sheet sets bottom placement", () => {
    const node = sheet({ open: true, title: "Actions", placement: "bottom" })

    expect(node.type).toBe("sheet")
    expect(node.props.placement).toBe("bottom")
    expect(node.props.title).toBe("Actions")
  })
})

describe("gestures and layers", () => {
  test("pager, tabs and segmented normalize items and forward changes", () => {
    const seen: string[] = []
    const p = pager({ onPageChange: (index) => seen.push(`page:${index}`) }, text("a"))
    const t = tabs({ items: ["One", "Two"], onChange: (index) => seen.push(`tab:${index}`) }, text("a"))
    const s = segmented({ items: [{ label: "A" }], onChange: (index) => seen.push(`segment:${index}`) })

    expect(p.type).toBe("pager")
    expect(t.type).toBe("tabs")
    expect(t.props.items).toEqual([{ label: "One" }, { label: "Two" }])
    expect(s.type).toBe("segmented")

    dispatchUiEvent(p.id, "change", 1)
    dispatchUiEvent(t.id, "change", 1)
    dispatchUiEvent(s.id, "change", 0)

    expect(seen).toEqual(["page:1", "tab:1", "segment:0"])
  })

  test("nav rail normalizes items and forwards changes", () => {
    const seen: number[] = []
    const node = navRail(
      { items: ["One", { label: "Two", icon: "bolt" }], index: 1, onChange: (index) => seen.push(index) },
      text("a"),
    )

    expect(node.type).toBe("navRail")
    expect(node.props.items).toEqual([{ label: "One" }, { label: "Two", icon: "bolt" }])
    expect(node.children?.length).toBe(1)

    dispatchUiEvent(node.id, "change", 0)
    expect(seen).toEqual([0])
  })

  test("snackbar, popover and zoomable forward their events", () => {
    const seen: string[] = []
    const bar = snackbar({
      text: "saved",
      actionLabel: "Undo",
      duration: 1000,
      onAction: () => seen.push("action"),
      onClose: () => seen.push("close"),
    })
    const pop = popover({ open: true, onClose: () => seen.push("popover") })
    const zoom = zoomable({ onZoom: (scale) => seen.push(`zoom:${scale}`) })

    expect(bar.props.duration).toBe(1000)
    expect(pop.type).toBe("popover")

    dispatchUiEvent(bar.id, "action", undefined)
    dispatchUiEvent(pop.id, "close", undefined)
    dispatchUiEvent(zoom.id, "zoom", 2)

    expect(seen).toEqual(["action", "popover", "zoom:2"])
  })

  test("long press is available on buttons, cards, boxes, images and chips", () => {
    const seen: string[] = []

    const nodes = [
      button("b", { onLongPress: () => seen.push("button") }),
      card({ onLongPress: () => seen.push("card") }),
      box({ onLongPress: () => seen.push("box") }),
      image({ src: "a.png", onLongPress: () => seen.push("image") }),
      chip("c", { onLongPress: () => seen.push("chip") }),
    ]

    for (const node of nodes) dispatchUiEvent(node.id, "longPress", undefined)

    expect(seen).toEqual(["button", "card", "box", "image", "chip"])
  })
})

describe("lists and grids", () => {
  test("grid keeps its children", () => {
    const tree = grid({ columns: 3 }, text("a"), text("b"))

    expect(tree.type).toBe("grid")
    expect(tree.props.columns).toBe(3)
    expect(tree.children?.length).toBe(2)
  })

  test("virtual list forwards paging, selection and action events", () => {
    const seen: string[] = []
    const node = virtualList({
      items: [{ key: "a", title: "Alpha" }],
      selectable: true,
      onEndReached: () => seen.push("end"),
      onRefresh: () => seen.push("refresh"),
      onSelect: (key, selected) => seen.push(`select:${key}:${selected}`),
      onPress: (key) => seen.push(`press:${key}`),
      onAction: (key, action) => seen.push(`action:${key}:${action}`),
      onReorder: (from, to) => seen.push(`reorder:${from}:${to}`),
    })

    dispatchUiEvent(node.id, "endReached", undefined)
    dispatchUiEvent(node.id, "refresh", undefined)
    dispatchUiEvent(node.id, "select", { key: "a", selected: true })
    dispatchUiEvent(node.id, "press", "a")
    dispatchUiEvent(node.id, "action", { key: "a", action: "delete" })
    dispatchUiEvent(node.id, "reorder", { from: 0, to: 2 })

    expect(seen).toEqual(["end", "refresh", "select:a:true", "press:a", "action:a:delete", "reorder:0:2"])
  })
})

describe("qml-like components", () => {
  test("flattens variadic and array children and drops empty ones", () => {
    const tree = Column({}, Text({}, "a"), null, false, [Text({}, "b")])

    expect(tree.children?.map((child) => child.type)).toEqual(["text", "text"])
  })

  test("Canvas sends its draw function as source", () => {
    const node = Canvas({ width: 10, height: 10, params: { n: 1 }, draw: (ctx, { params }) => ctx.fillRect(0, 0, params.n, 1) })

    expect(node.type).toBe("canvas")
    expect(String(node.props.drawSource)).toContain("fillRect")
    expect(node.props.draw).toBeUndefined()
  })

  test("effects split their options into uniforms and node props", () => {
    const node = Wave({ width: 100, color: "#fff", speed: 2 })

    expect(node.type).toBe("shader")
    expect(node.props.source).toBe("qrc:/runtime/shaders/wave.frag")
    expect(node.props.width).toBe(100)
    expect((node.props.uniforms as Record<string, unknown>).speed).toBe(2)
    expect((node.props.uniforms as Record<string, unknown>).amplitude).toBe(4)
  })

  test("Arrange sends its function as source and keeps children", () => {
    const node = Arrange({ params: { n: 1 }, arrange: (index, _count, { params }) => ({ x: index * params.n }) }, Text({}, "a"))

    expect(node.type).toBe("arrange")
    expect(String(node.props.arrangeSource)).toContain("params.n")
    expect(node.children?.length).toBe(1)
  })

  test("Orbit turns its options into params", () => {
    const node = Orbit({ radiusX: 200, spin: 90 }, Text({}, "a"))
    const params = node.props.params as Record<string, number>

    expect(node.type).toBe("arrange")
    expect(params.radiusY).toBe(200)
    expect(params.spin).toBe(90)
    expect(node.props.animated).toBe(false)
  })

  test("For builds a keyed list", () => {
    const tasks = [{ id: "a" }, { id: "b" }]
    const node = For({
      each: tasks,
      keyOf: (task) => task.id,
      render: (task) => Text({}, task.id),
    })

    expect(node.type).toBe("list")
    expect(node.children?.length).toBe(2)
    expect(node.props.itemKeys).toEqual(["a", "b"])
  })

  test("web-named components map to the right nodes", () => {
    const row = Card({ padding: 12 }, Button({}, "Save"), Input({ placeholder: "Name" }), Checkbox({ label: "Done" }))

    expect(row.type).toBe("card")
    expect(row.children?.map((child) => child.type)).toEqual(["button", "textInput", "checkbox"])
    expect(Header({ title: "Tasks" }).type).toBe("appBar")
  })

  test("component passes props and children", () => {
    const Row = component<{ label: string }>(({ label }, ...children) => Column({}, Text({}, label), ...children))
    const node = Row({ label: "Title" }, Text({}, "Body"))

    expect(node.children?.length).toBe(2)
  })

  test("radio and radio group carry options and emit values", () => {
    const selected: boolean[] = []
    const changed: Array<string | number> = []
    const single = radio("Daily", { checked: true, onSelect: () => selected.push(true) })
    const group = radioGroup({
      options: ["Daily", { value: "weekly", label: "Weekly" }],
      value: "daily",
      direction: "horizontal",
      onChange: (value) => changed.push(value),
    })

    expect(single.type).toBe("radio")
    expect(single.props).toMatchObject({ label: "Daily", checked: true })
    expect(group.type).toBe("radioGroup")
    expect(group.props).toMatchObject({
      options: [
        { value: "Daily", label: "Daily" },
        { value: "weekly", label: "Weekly" },
      ],
      value: "daily",
      direction: "horizontal",
    })

    dispatchUiEvent(single.id, "select", true)
    dispatchUiEvent(group.id, "change", "weekly")

    expect(selected).toEqual([true])
    expect(changed).toEqual(["weekly"])
  })

  test("range slider maps both handles", () => {
    const ranges: Array<[number, number]> = []
    const node = rangeSlider({
      min: 0,
      max: 100,
      from: 20,
      to: 80,
      step: 5,
      onChange: (from, to) => ranges.push([from, to]),
    })

    expect(node.type).toBe("rangeSlider")
    expect(node.props).toMatchObject({ min: 0, max: 100, from: 20, to: 80, step: 5 })

    dispatchUiEvent(node.id, "change", { from: 30, to: 60 })

    expect(ranges).toEqual([[30, 60]])
  })

  test("search field emits input, submit and clear", () => {
    const events: string[] = []
    const node = searchField({
      value: "",
      placeholder: "Search",
      debounce: 200,
      onInput: (value) => events.push(`input:${value}`),
      onSubmit: (value) => events.push(`submit:${value}`),
      onClear: () => events.push("clear"),
    })

    expect(node.type).toBe("searchField")
    expect(node.props).toMatchObject({ value: "", placeholder: "Search", debounce: 200 })

    dispatchUiEvent(node.id, "input", "puls")
    dispatchUiEvent(node.id, "submit", "pulsar")
    dispatchUiEvent(node.id, "clear", null)

    expect(events).toEqual(["input:puls", "submit:pulsar", "clear"])
  })

  test("menu serializes items and emits select and close", () => {
    const got: string[] = []
    const node = menu({
      open: true,
      items: [
        { id: "rename", label: "Rename", icon: "edit" },
        { id: "sep", label: "", separator: true },
        { id: "delete", label: "Delete", danger: true },
      ],
      onSelect: (id) => got.push(`select:${id}`),
      onClose: () => got.push("close"),
    })

    expect(node.type).toBe("menu")
    expect(node.props.items).toHaveLength(3)

    dispatchUiEvent(node.id, "select", "delete")
    dispatchUiEvent(node.id, "close", null)

    expect(got).toEqual(["select:delete", "close"])
  })

  test("accordion keeps sections as children and reports toggles", () => {
    const seen: Array<[number, boolean]> = []
    const node = accordion(
      { multiple: false, onChange: (index, open) => seen.push([index, open]) },
      accordionSection({ title: "General", icon: "tune", defaultOpen: true }, Text({}, "Body")),
      accordionSection({ title: "Advanced" }),
    )

    expect(node.type).toBe("accordion")
    expect(node.props.multiple).toBe(false)
    expect(node.children?.map((child) => child.type)).toEqual(["accordionSection", "accordionSection"])
    expect(node.children?.[0]?.props).toMatchObject({ title: "General", icon: "tune", defaultOpen: true })

    dispatchUiEvent(node.id, "toggle", { index: 1, open: true })

    expect(seen).toEqual([[1, true]])
  })

  test("fab carries placement and presses", () => {
    const pressed: number[] = []
    const node = fab({ icon: "add", size: 64, placement: "inline", onClick: () => pressed.push(1) })

    expect(node.type).toBe("fab")
    expect(node.props).toMatchObject({ icon: "add", size: 64, placement: "inline" })

    dispatchUiEvent(node.id, "click", null)

    expect(pressed).toEqual([1])
  })

  test("toolbar is a surface row with actions", () => {
    const node = toolbar(
      { gap: 6, padding: 10, actions: [button("Save", {})] },
      text("Inbox"),
      spacer({ fillWidth: true }),
    )

    expect(node.type).toBe("box")
    expect(node.props).toMatchObject({ padding: 10 })
    expect(node.children?.[0]?.type).toBe("row")
    expect(node.children?.[0]?.props.gap).toBe(6)
    expect(node.children?.[0]?.children?.map((child) => child.type)).toEqual(["text", "spacer", "button"])
  })

  test("empty state composes icon, title, text and action", () => {
    const node = emptyState({
      icon: "inbox",
      title: "Nothing here",
      text: "Messages will appear here.",
      action: button("Refresh", {}),
    })

    expect(node.type).toBe("column")
    expect(node.props).toMatchObject({ align: "center", fillWidth: true })
    expect(node.children?.map((child) => child.type)).toEqual(["box", "text", "text", "button"])
  })

  test("nav bar normalizes items and reports the index", () => {
    const changes: number[] = []
    const node = navBar({
      items: ["Quick", { label: "Kit", icon: "widgets" }],
      value: 1,
      showLabels: true,
      onChange: (value) => changes.push(value),
    })

    expect(node.type).toBe("navBar")
    expect(node.props).toMatchObject({
      items: [{ label: "Quick" }, { label: "Kit", icon: "widgets" }],
      value: 1,
      showLabels: true,
    })

    dispatchUiEvent(node.id, "change", 0)

    expect(changes).toEqual([0])
  })

  test("container caps the width and centers its content", () => {
    const node = container({ maxWidth: 720, gap: 4 }, Text({}, "Body"))

    expect(node.type).toBe("box")
    expect(node.props).toMatchObject({ maxWidth: 720, fillWidth: true, align: "center" })
    expect(node.children?.[0]?.type).toBe("column")
    expect(node.children?.[0]?.props.gap).toBe(4)
    expect(node.children?.[0]?.children?.[0]?.type).toBe("text")
  })

  test("neon wraps a node and keeps its layout props", () => {
    const node = card({ neon: { color: "cyan", glow: 1 }, fillWidth: true }, Text({}, "Inside"))

    expect(node.type).toBe("neon")
    expect(node.props).toMatchObject({ color: "cyan", glow: 1, fillWidth: true })
    expect(node.children?.[0]?.type).toBe("card")
    expect(node.children?.[0]?.props.neon).toBeUndefined()
  })

  test("neon true uses defaults and an explicit wrapper works", () => {
    const wrapped = button("Go", { neon: true })
    const explicit = neon({ color: "pink" }, Text({}, "hi"))

    expect(wrapped.type).toBe("neon")
    expect(wrapped.props.color).toBeUndefined()
    expect(wrapped.children?.[0]?.type).toBe("button")
    expect(explicit.type).toBe("neon")
    expect(explicit.props.color).toBe("pink")
    expect(explicit.children?.[0]?.type).toBe("text")
  })

  test("elevation keeps shadow color alongside the level", () => {
    const cardNode = card({ elevation: 4, shadowColor: "black" })
    const boxNode = box({ elevation: 2, shadowColor: "navy" })
    const buttonNode = button("Lift", { variant: "elevated", elevation: 3, shadowColor: "gray" })

    expect(cardNode.props).toMatchObject({ elevation: 4, shadowColor: "black" })
    expect(boxNode.props).toMatchObject({ elevation: 2, shadowColor: "navy" })
    expect(buttonNode.props).toMatchObject({ elevation: 3, shadowColor: "gray" })
  })
})

describe("layout additions", () => {
  test("page keeps the header and footer outside the scroll body", () => {
    const out = serialize([Page({ header: text("header"), footer: text("footer") }, text("body"))]) as Array<{
      type: string
      children: Array<{ type: string; children?: Array<{ props: Record<string, unknown> }> }>
    }>

    const page = out[0]!
    const children = page.children as Array<{ type: string; props: Record<string, unknown> }>
    const header = children[0]!
    const scroll = children[1]!
    const footer = children[2]!

    expect(page.type).toBe("column")
    expect(header.props.text).toBe("header")
    expect(scroll.type).toBe("scroll")
    expect(footer.props.text).toBe("footer")
  })

  test("wrap and stack serialize as layout nodes", () => {
    const out = serialize([
      Wrap({ gap: 6 }, text("one"), text("two")),
      Stack({ width: 20, height: 20 }, text("overlay")),
    ]) as Array<{ type: string; props: Record<string, unknown>; children: unknown[] }>

    expect(out[0]!.type).toBe("wrap")
    expect(out[0]!.children).toHaveLength(2)
    expect(out[1]!.type).toBe("stack")
    expect(out[1]!.props.width).toBe(20)
  })

  test("card hoverColor is serialized", () => {
    const out = serialize([Card({ hoverColor: "#123456" }, text("row"))]) as Array<{
      props: Record<string, unknown>
    }>

    expect(out[0]!.props.hoverColor).toBe("#123456")
  })
})
