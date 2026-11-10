import { describe, expect, test } from "bun:test"
import { identityFor } from "./create.ts"

describe("identityFor", () => {
  test("a plain name keeps working", () => {
    expect(identityFor("my-app", "/work")).toEqual({
      target: "/work/my-app",
      name: "my-app",
      id: "com.example.my-app",
      title: "My App",
    })
  })

  test("a dot takes the name of the current folder", () => {
    expect(identityFor(".", "/work/todo_list")).toEqual({
      target: "/work/todo_list",
      name: "todo_list",
      id: "com.example.todo-list",
      title: "Todo List",
    })
  })

  test("a path takes the name of its last folder", () => {
    expect(identityFor("../notes", "/work/sub")).toMatchObject({ name: "notes", id: "com.example.notes" })
  })

  test("a folder with no usable letters falls back to app", () => {
    expect(identityFor("---", "/work").id).toBe("com.example.app")
  })
})
