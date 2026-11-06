import { spawnSync } from "bun"
import { existsSync, globSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "fs"
import { homedir, tmpdir } from "os"
import { dirname, join } from "path"
import { toolchainCurrent } from "./core.ts"
import { createIgnoreFilter } from "./ignore.ts"
import type { AppManifest } from "../core/sdk/manifest.ts"

const LIBRARY = `
vec2 pixel;

float wave(float x, float frequency, float speed) {
    return sin(6.28318530 * frequency * x - time * speed);
}

float hash(vec2 point) {
    vec3 mixed = fract(vec3(point.xyx) * 0.1031);

    mixed += dot(mixed, mixed.yzx + 33.33);

    return fract((mixed.x + mixed.y) * mixed.z);
}

float noise(float x) {
    float cell = floor(x);
    float part = fract(x);
    float a = hash(vec2(cell, 0.0));
    float b = hash(vec2(cell + 1.0, 0.0));

    return mix(a, b, part * part * (3.0 - 2.0 * part));
}

float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 part = fract(point);
    vec2 blend = part * part * (3.0 - 2.0 * part);
    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));

    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

float fbm(vec2 point) {
    float value = 0.0;
    float weight = 0.5;

    for (int i = 0; i < 4; i++) {
        value += weight * noise(point);
        point *= 2.0;
        weight *= 0.5;
    }

    return value;
}

float zigzag(float x, float seed) {
    float cell = floor(x);
    float a = hash(vec2(cell, seed));
    float b = hash(vec2(cell + 1.0, seed));

    return mix(a, b, fract(x)) * 2.0 - 1.0;
}

float segment(vec2 point, vec2 from, vec2 to) {
    vec2 along = to - from;
    float part = clamp(dot(point - from, along) / max(dot(along, along), 0.0001), 0.0, 1.0);

    return length(point - from - along * part);
}

float line(float distance) {
    return clamp(0.5 - distance, 0.0, 1.0);
}

float glow(float distance, float radius) {
    float falloff = 1.0 - clamp(distance / max(radius, 0.0001), 0.0, 1.0);

    return falloff * falloff;
}

float fade(float distance, float size) {
    return clamp(distance / max(size, 0.0001), 0.0, 1.0);
}
`

/** Turns the short form users write into a complete Qt fragment shader. */
export const wrapFragment = (source: string): string => {
  const uniforms: Array<{ type: string; name: string }> = []
  const body = source.replace(/^\s*uniform\s+(\w+)\s+(\w+)\s*;[^\n]*$/gm, (_line, type: string, name: string) => {
    uniforms.push({ type, name })

    return ""
  })

  if (!/\bvec4\s+effect\s*\(\s*vec2\s+\w+\s*\)/.test(body)) {
    throw new Error("a shader needs a function: vec4 effect(vec2 uv)")
  }

  const members = uniforms.map(({ type, name }) => `    ${type} ${name};`).join("\n")
  const defines = uniforms.map(({ name }) => `#define ${name} ubuf.${name}`).join("\n")

  return `#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float pulsar_time;
    vec2 pulsar_resolution;
${members}
} ubuf;
#define time ubuf.pulsar_time
#define resolution ubuf.pulsar_resolution
${LIBRARY}
${defines}
#line 1
${body}

void main() {
    pixel = qt_TexCoord0 * resolution;

    vec4 result = effect(qt_TexCoord0);

    fragColor = vec4(result.rgb * result.a, result.a) * ubuf.qt_Opacity;
}
`
}

const androidHostQsb = (): string[] => {
  const base = join(homedir(), ".local/share/pulsar/android/qt")

  if (!existsSync(base)) return []

  return globSync(join(base, "*/gcc_64/bin/qsb"))
}

export const findQsb = (): string | null => {
  const candidates = [
    process.env.PULSAR_QSB,
    join(toolchainCurrent(), "lib", "Qt", "bin", "qsb"),
    join(toolchainCurrent(), "bin", "qsb.exe"),
    ...androidHostQsb(),
    "/usr/lib/qt6/bin/qsb",
    "/usr/lib/qt6/qsb",
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }

  for (const name of ["qsb", "qsb6"]) {
    if (spawnSync(["which", name]).exitCode === 0) return name
  }

  return null
}

export const compileShader = (inputPath: string, outputPath: string): void => {
  const qsb = findQsb()

  if (!qsb) throw new Error("cannot compile shaders: the Qt qsb tool was not found; set PULSAR_QSB")

  const wrapped = join(tmpdir(), `pulsar-${process.pid}-${Date.now()}.frag`)

  const source = readFileSync(inputPath, "utf8")

  writeFileSync(wrapped, inputPath.endsWith(".raw.frag") ? source : wrapFragment(source))

  const result = spawnSync([qsb, "--glsl", "100 es,120,150", "--hlsl", "50", "--msl", "12", "-o", outputPath, wrapped])

  rmSync(wrapped, { force: true })

  if (result.exitCode !== 0) {
    const log = `${result.stderr.toString()}${result.stdout.toString()}`.replace(/ERROR: 0?:?(\d+):/g, "line $1:")

    throw new Error(`cannot compile ${inputPath}:\n${log}`)
  }
}

const findShaders = (dir: string, ignored: (path: string, isDir: boolean) => boolean, root: string): string[] => {
  const found: string[] = []

  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const relative = path.slice(root.length + 1)
    const isDir = statSync(path).isDirectory()

    if (ignored(relative, isDir)) continue
    if (isDir) found.push(...findShaders(path, ignored, root))
    else if (name.endsWith(".frag")) found.push(path)
  }

  return found
}

/** Recompiles shaders while `pulsar dev` runs, and keeps going after a mistake. */
export const watchAppShaders = (appDir: string): void => {
  watch(appDir, { recursive: true }, (_event, filename) => {
    if (!filename || !String(filename).endsWith(".frag")) return

    try {
      compileAppShaders(appDir)
    } catch (error) {
      console.error(`pulsar: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/** Compiles every changed `.frag` of an app next to its source, as `.frag.qsb`. */
export const compileAppShaders = (appDir: string, manifest?: AppManifest): void => {
  const filter = createIgnoreFilter(appDir, manifest ?? null)

  for (const input of findShaders(appDir, filter.ignored, appDir)) {
    const output = `${input}.qsb`

    if (existsSync(output) && statSync(output).mtimeMs >= statSync(input).mtimeMs) continue

    compileShader(input, output)
    console.log(`pulsar: compiled ${input.slice(dirname(appDir).length + 1)}`)
  }
}
