uniform vec4 color;
uniform vec2 from;
uniform vec2 to;
uniform float progress;
uniform float speed;
uniform float jitter;
uniform float thickness;
uniform float glowRadius;

const float STEP = 14.0;

float boltOffset(float cell, float seed, float limit) {
    float along = cell * STEP;
    float pinned = fade(along, 24.0) * fade(limit - along, 24.0);

    return jitter * pinned * (zigzag(cell * 0.45, seed) + 0.5 * zigzag(cell, seed + 7.0));
}

vec4 effect(vec2 uv) {
    vec2 start = from * resolution;
    vec2 way = to * resolution - start;
    float full = max(length(way), 1.0);
    vec2 forward = way / full;
    vec2 local = vec2(dot(pixel - start, forward), dot(pixel - start, vec2(-forward.y, forward.x)));
    float limit = progress * full;
    float seed = floor(time * speed);
    float cell = floor(local.x / STEP);
    float nearest = 1000.0;

    for (float i = -1.0; i <= 1.0; i += 1.0) {
        float a = cell + i;
        float b = a + 1.0;

        if (a * STEP > limit || b * STEP < 0.0) continue;

        nearest = min(nearest, segment(local, vec2(a * STEP, boltOffset(a, seed, limit)), vec2(b * STEP, boltOffset(b, seed, limit))));
    }

    nearest -= thickness / 2.0;

    float core = line(nearest);
    float aura = glow(nearest, glowRadius);

    return vec4(mix(color.rgb, vec3(1.0), core), max(aura * color.a, core));
}
