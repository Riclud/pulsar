import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { compileAppShaders, compileShader, findQsb, wrapFragment } from "./shaders.ts"

const SHORT = `uniform vec4 color;
uniform float speed;

vec4 effect(vec2 uv) {
    return vec4(color.rgb, wave(uv.x, 3.0, speed));
}
`

describe("wrapFragment", () => {
  test("turns uniforms into block members and keeps the user line numbers", () => {
    const out = wrapFragment(SHORT)

    expect(out).toContain("    vec4 color;")
    expect(out).toContain("#define speed ubuf.speed")
    expect(out).toContain("#line 1")
    expect(out).toContain("float fbm(vec2 point)")
  })

  test("names the function a shader must have", () => {
    expect(() => wrapFragment("void main() {}")).toThrow("vec4 effect(vec2 uv)")
  })
})

describe.if(findQsb() !== null)("compileShader", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "pulsar-shader-"))

  test("compiles the short form", () => {
    const root = dir()

    writeFileSync(join(root, "a.frag"), SHORT)
    compileShader(join(root, "a.frag"), join(root, "a.frag.qsb"))

    expect(statSync(join(root, "a.frag.qsb")).size).toBeGreaterThan(100)
  })

  test("reports the line of a mistake in the user's file", () => {
    const root = dir()

    writeFileSync(join(root, "a.frag"), "vec4 effect(vec2 uv) {\n    return oops;\n}\n")

    expect(() => compileShader(join(root, "a.frag"), join(root, "a.frag.qsb"))).toThrow("line 2")
  })

  test("compiles an app's changed shaders only", () => {
    const root = dir()

    writeFileSync(join(root, "a.frag"), SHORT)
    compileAppShaders(root)

    const first = statSync(join(root, "a.frag.qsb")).mtimeMs

    compileAppShaders(root)

    expect(existsSync(join(root, "a.frag.qsb"))).toBe(true)
    expect(statSync(join(root, "a.frag.qsb")).mtimeMs).toBe(first)
    expect(readFileSync(join(root, "a.frag"), "utf8")).toBe(SHORT)
  })
})

describe("findQsb", () => {
  test("does not throw for a fresh home without the Android toolchain", () => {
    const home = mkdtempSync(join(tmpdir(), "pulsar-home-"))
    const script = `import { findQsb } from ${JSON.stringify(join(import.meta.dir, "shaders.ts"))}; findQsb()`
    const run = Bun.spawnSync(["bun", "-e", script], { env: { ...process.env, HOME: home } })

    expect(run.stderr.toString()).not.toContain("ENOENT")
    expect(run.exitCode).toBe(0)
  })
})
