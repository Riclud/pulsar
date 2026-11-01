import { describe, expect, test } from "bun:test"
import { App } from "./app.ts"
import { Router, createRouter } from "./nav.ts"
import { text } from "./ui.ts"

describe("Router", () => {
  test("pushes, pops and publishes route state", () => {
    const app = new App({ label: "main" })
    const router = createRouter(app, { initial: "home" })

    expect(router.current()).toEqual({ name: "home", params: undefined })
    expect(app.store.get("route")).toEqual({ name: "home", params: {}, canGoBack: false, depth: 1 })

    router.push("details", { id: 7 })

    expect(router.current()).toEqual({ name: "details", params: { id: 7 } })
    expect(app.store.get("route")).toEqual({
      name: "details",
      params: { id: 7 },
      canGoBack: true,
      depth: 2,
    })

    expect(router.pop()).toBe(true)
    expect(router.current().name).toBe("home")
    expect(router.pop()).toBe(false)
  })

  test("replace and reset keep the stack consistent", () => {
    const app = new App({ label: "main" })
    const router = new Router(app, { initial: "home", handleBack: false })

    router.push("a").push("b").replace("c")

    expect(router.entries().map((route) => route.name)).toEqual(["home", "a", "c"])

    router.reset("home", { fresh: true })

    expect(router.depth()).toBe(1)
    expect(router.canGoBack()).toBe(false)
  })

  test("system back pops and quits at the root", () => {
    const app = new App({ label: "main" })
    let quits = 0

    app.onQuit = () => {
      quits += 1
    }

    const router = createRouter(app, { initial: "home" })

    router.push("one")
    app.dispatchEvent("back-pressed", {})

    expect(router.current().name).toBe("home")

    app.dispatchEvent("back-pressed", {})

    expect(quits).toBe(1)
  })

  test("view picks the current screen and passes params", () => {
    const app = new App({ label: "main" })
    const router = createRouter(app, { initial: "list", handleBack: false })

    router.push("item", { id: 4 })

    const node = router.view({
      item: (params) => text({ text: `item ${params.id}` }),
      list: text("list"),
    }) as { props: Record<string, unknown> }

    expect(node.props.text).toBe("item 4")
    expect(router.view({})).toBeNull()
  })
})
