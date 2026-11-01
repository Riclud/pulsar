import { describe, expect, test } from "bun:test"
import { App } from "./app.ts"
import { Breakpoints, createBreakpoints, responsive } from "./responsive.ts"
import { text } from "./ui.ts"

describe("Breakpoints", () => {
  test("picks the largest matching breakpoint", () => {
    const app = new App({ label: "main" })
    const points = createBreakpoints(app, undefined, { width: 0 })

    expect(points.current()).toBe("compact")

    points.setWidth(700)
    expect(points.current()).toBe("medium")

    points.setWidth(1400)
    expect(points.current()).toBe("expanded")
    expect(points.atLeast("medium")).toBe(true)
    expect(points.is("compact")).toBe(false)
  })

  test("publishes state and follows window-resize events", () => {
    const app = new App({ label: "main" })
    const points = new Breakpoints(app, { compact: 0, wide: 800 }, { width: 0 })

    app.dispatchEvent("window-resize", { label: "main", width: 900 })

    expect(points.current()).toBe("wide")
    expect(app.store.get("layout")).toBeNull()
    expect(app.store.get("breakpoint")).toEqual({ name: "wide", width: 900 })
  })

  test("view resolves a branch for the current breakpoint", () => {
    const app = new App({ label: "main" })
    const points = createBreakpoints(app, { compact: 0, wide: 800 }, { width: 900 })

    const node = points.view({
      compact: text("narrow"),
      wide: (state) => text({ text: `wide ${state.width}` }),
    }) as { props: Record<string, unknown> }

    expect(node.props.text).toBe("wide 900")
    expect(responsive(points, { compact: text("narrow") })).toBeNull()
  })
})
