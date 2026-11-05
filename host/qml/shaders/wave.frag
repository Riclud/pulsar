uniform vec4 color;
uniform float amplitude;
uniform float frequency;
uniform float speed;
uniform float thickness;
uniform float glowRadius;

vec4 effect(vec2 uv) {
    float y = resolution.y / 2.0 + amplitude * wave(uv.x, frequency, speed);
    float distance = abs(pixel.y - y) - thickness / 2.0;
    float edge = fade(pixel.x, thickness / 2.0) * fade(resolution.x - pixel.x, thickness / 2.0);

    return vec4(color.rgb, color.a * edge * max(line(distance), glow(distance, glowRadius)));
}
