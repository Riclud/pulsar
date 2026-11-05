uniform vec4 color;
uniform vec4 accent;
uniform float speed;
uniform float scale;

vec4 effect(vec2 uv) {
    vec2 point = uv * scale * vec2(resolution.x / max(resolution.y, 1.0), 1.0);
    float flow = fbm(point + vec2(time * speed, -time * speed * 0.6));
    float band = fbm(point * 1.7 + flow * 2.0 - time * speed * 0.4);
    float mask = smoothstep(0.25, 0.85, band);

    return vec4(mix(color.rgb, accent.rgb, flow), mask * mix(color.a, accent.a, flow));
}
