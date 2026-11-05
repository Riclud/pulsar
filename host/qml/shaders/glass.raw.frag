#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec4 area;
    vec2 size;
    float cornerRadius;
    vec4 tint;
    vec4 base;
} ubuf;
layout(binding = 1) uniform sampler2D backdrop;

void main() {
    vec2 point = qt_TexCoord0 * ubuf.size;
    vec2 corner = abs(point - ubuf.size / 2.0) - ubuf.size / 2.0 + ubuf.cornerRadius;
    float distance = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - ubuf.cornerRadius;
    float inside = clamp(0.5 - distance, 0.0, 1.0);
    vec4 behind = texture(backdrop, ubuf.area.xy + qt_TexCoord0 * ubuf.area.zw);
    vec3 color = behind.rgb + ubuf.base.rgb * (1.0 - behind.a);
    vec3 mixed = mix(color, ubuf.tint.rgb, ubuf.tint.a);

    fragColor = vec4(mixed, 1.0) * inside * ubuf.qt_Opacity;
}
