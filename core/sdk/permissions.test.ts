import { describe, expect, test } from "bun:test"
import { capabilityPermission, createPermissionGate } from "./permissions.ts"

describe("capabilityPermission", () => {
  test("maps known capabilities", () => {
    expect(capabilityPermission("fs.readFile")).toBe("fs")
    expect(capabilityPermission("nw.fetch")).toBe("net")
    expect(capabilityPermission("nw.request")).toBe("net")
    expect(capabilityPermission("nw.websocket")).toBe("net")
    expect(capabilityPermission("shell.notify")).toBe("notify")
    expect(capabilityPermission("secure.set")).toBe("secure")
  })

  test("leaves custom capabilities ungated", () => {
    expect(capabilityPermission("greet")).toBeNull()
    expect(capabilityPermission("window")).toBeNull()
  })
})

describe("createPermissionGate", () => {
  test("disables the gate when permissions are absent", () => {
    expect(createPermissionGate(undefined)).toBeNull()
  })

  test("allows granted capabilities", () => {
    const gate = createPermissionGate(["fs"])!
    expect(() => gate("fs.readFile")).not.toThrow()
  })

  test("denies capabilities that are not granted", () => {
    const gate = createPermissionGate([])!
    expect(() => gate("fs.readFile")).toThrow(/permission denied: fs\.readFile/)
  })

  test("never gates custom capabilities", () => {
    const gate = createPermissionGate([])!
    expect(() => gate("greet")).not.toThrow()
  })
})
