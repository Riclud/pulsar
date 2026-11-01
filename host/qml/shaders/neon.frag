#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float intensity;
    float glow;
    float bloom;
    float threshold;
    vec2 texel;
    vec4 neonColor;
} ubuf;

layout(binding = 1) uniform sampler2D source;

float luma(vec4 c) {
    return max(max(c.r, c.g), c.b) * c.a;
}

float bright(vec4 c) {
    return clamp((luma(c) - ubuf.threshold) / max(0.001, 1.0 - ubuf.threshold), 0.0, 1.0);
}

void main() {
    vec2 uv = qt_TexCoord0;
    vec4 base = texture(source, uv);

    float wide = luma(base) * 0.35;
    vec3 bloomAcc = mix(base.rgb, ubuf.neonColor.rgb, 0.55) * bright(base);

    const int N = 8;

    for (int i = 0; i < N; ++i) {
        float a = float(i) * 0.785398163;
        vec2 dir = vec2(cos(a), sin(a));

        vec4 near = texture(source, uv + dir * ubuf.texel * 4.0);
        vec4 far = texture(source, uv + dir * ubuf.texel * 12.0);

        wide += luma(near) * 0.55 + luma(far) * 0.35;
        bloomAcc += mix(near.rgb, ubuf.neonColor.rgb, 0.55) * bright(near) * 0.5;
        bloomAcc += mix(far.rgb, ubuf.neonColor.rgb, 0.55) * bright(far) * 0.25;
    }

    wide /= float(N) * 1.25;
    bloomAcc /= float(N) * 0.75;

    float rim = clamp((wide - base.a) * 1.6, 0.0, 1.0);
    float glowAmount = clamp(rim * ubuf.glow * ubuf.intensity, 0.0, 1.0);
    vec3 glowColor = ubuf.neonColor.rgb * glowAmount;
    vec3 bloomColor = bloomAcc * ubuf.bloom * ubuf.intensity * 0.7;

    float alpha = max(base.a, clamp(glowAmount + ubuf.bloom * ubuf.intensity * 0.22 * bright(base), 0.0, 1.0));
    vec3 rgb = min(base.rgb + glowColor + bloomColor, vec3(1.0));

    fragColor = vec4(rgb, alpha) * ubuf.qt_Opacity;
}
