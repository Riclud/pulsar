import { describe, expect, spyOn, test } from "bun:test"
import { App } from "./app.ts"
import { signal } from "./reactive.ts"
import { Box, Button, Column, For, Radio, Row, Text, When, component, serialize, type UiPatch } from "./ui.ts"
import { Fragment, jsx } from "./jsx-runtime.ts"

const tick = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("jsx", () => {
  test("matches the function form", () => {
    const tags = serialize([
      <Row key="r" gap={8} fillWidth>
        <Text size={20}>Hello</Text>
        <Button onClick={() => {}}>Save</Button>
      </Row>,
    ])
    const calls = serialize([
      Row({ key: "r", gap: 8, fillWidth: true }, Text({ size: 20 }, "Hello"), Button({ onClick: () => {} }, "Save")),
    ])
    const shape = (tree: unknown) => JSON.parse(JSON.stringify(tree).replace(/"id":\d+,/g, ""))

    expect(shape(tags)).toEqual(shape(calls))
  })

  test("joins text and expressions in Text", () => {
    const count = 3
    const [node] = serialize([<Text>Left: {count}</Text>]) as Array<{ props: { text: string } }>

    expect(node?.props.text).toBe("Left: 3")
  })

  test("a skipped conditional child keeps its slot", () => {
    const paths = (show: boolean) => {
      const [tree] = serialize([
        <Column key="c">
          {show && <Text>Header</Text>}
          <Text>Body</Text>
        </Column>,
      ]) as Array<{ children: Array<{ path: string }> }>

      return tree?.children.map((child) => child.path)
    }

    expect(paths(false)).toEqual(["/c/1"])
    expect(paths(true)).toEqual(["/c/0", "/c/1"])
  })

  test("renders lists, fragments and helper components", () => {
    const items = ["a", "b"]
    const [tree] = serialize([
      <Column key="c">
        {items.map((item) => (
          <Text key={item}>{item}</Text>
        ))}
        <>
          <Text>In a fragment</Text>
        </>
        <When test={true} then={() => <Text>Shown</Text>} />
        <For each={items} keyOf={(item) => item} render={(item) => <Text>{item}</Text>} />
        <Radio label="Option" />
      </Column>,
    ]) as Array<{ children: Array<{ path: string; type: string }> }>

    expect(tree?.children.map((child) => child.type)).toEqual(["text", "text", "text", "text", "list", "radio"])
    expect(tree?.children[0]?.path).toBe("/c/a")
  })

  test("a component written with JSX tracks what it reads", async () => {
    const app = new App()
    const patches: UiPatch[][] = []
    const title = signal("a")
    const other = signal("b")
    let renders = 0

    const Title = component(() => {
      renders++

      return <Text>{title.get()}</Text>
    })

    app.onSendUi = () => {}
    app.onSendUiPatch = (_label, sent) => patches.push(sent)
    app.renderWindow("main", () => (
      <Column key="root">
        <Title />
        <Text>{other.get()}</Text>
      </Column>
    ))

    title.set("c")
    await tick()

    expect(renders).toBe(2)
    expect(patches[0]?.[0]?.path).toBe("/root/0")
  })

  test("children reach a component", () => {
    const Panel = component<{ title: string }>((props, ...children) => {
      return (
        <Box padding={8}>
          <Text>{props.title}</Text>
          {children}
        </Box>
      )
    })
    const [tree] = serialize([
      <Panel title="T">
        <Text>Inside</Text>
      </Panel>,
    ]) as Array<{ children: unknown[] }>

    expect(tree?.children.length).toBe(2)
  })

  test("a component can return a fragment", () => {
    const Pair = component(() => (
      <>
        <Text>One</Text>
        <Text>Two</Text>
      </>
    ))
    const [tree] = serialize([
      <Column key="c">
        <Pair />
      </Column>,
    ]) as Array<{ children: unknown[] }>

    expect(tree?.children.length).toBe(2)
    expect(typeof Fragment).toBe("function")
  })

  test("an HTML tag explains what to use instead", () => {
    expect(() => jsx("div", {})).toThrow("use a component such as <Box>")
  })

  test("text directly in a layout produces a warning", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})

    serialize([<Column>Plain text</Column>])

    expect(warn).toHaveBeenCalledTimes(1)

    warn.mockRestore()
  })
})
