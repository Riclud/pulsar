import { expect, test } from "bun:test"
import { platform, setPlatformInfo } from "./platform-info.ts"

test("platform reports what the runtime set", () => {
  setPlatformInfo({ os: "android", kind: "mobile", engine: "quickjs" })

  expect(platform()).toEqual({ os: "android", kind: "mobile", engine: "quickjs" })
})
