import { describe, expect, test } from "bun:test"
import { handleMessage } from "./mcp.ts"

describe("pulsar mcp", () => {
  test("initializes with tools", async () => {
    const result = (await handleMessage({ id: 1, method: "initialize", params: {} })) as {
      capabilities: Record<string, unknown>
      serverInfo: { name: string }
    }

    expect(result.serverInfo.name).toBe("pulsar")
    expect(result.capabilities.tools).toBeDefined()
  })

  test("lists the tools an agent needs", async () => {
    const result = (await handleMessage({ id: 2, method: "tools/list" })) as { tools: { name: string }[] }
    const names = result.tools.map((tool) => tool.name)

    for (const name of ["pulsar_start", "pulsar_ui", "pulsar_screenshot", "pulsar_click", "pulsar_type", "pulsar_logs"])
      expect(names).toContain(name)
  })

  test("reports a failing tool as a result the agent can read", async () => {
    const result = (await handleMessage({
      id: 3,
      method: "tools/call",
      params: { name: "pulsar_click", arguments: { text: "Save" } },
    })) as { isError?: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain("pulsar_start")
  })

  test("leaves unknown methods to the caller", async () => {
    expect(await handleMessage({ id: 4, method: "resources/list" })).toBeUndefined()
  })
})
