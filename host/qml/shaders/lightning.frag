uniform vec4 color;
uniform float progress;
uniform float speed;
uniform float jitter;
uniform float thickness;
uniform float glowRadius;

const float STEP = 14.0;

float boltY(float cell, float seed, float limit) {
    float x = cell * STEP;
    float pinned = fade(x, resolution.y * 0.5) * fade(limit - x, resolution.y * 0.5);
    float shape = zigzag(cell * 0.45, seed) + 0.5 * zigzag(cell, seed + 7.0);

    return resolution.y / 2.0 + jitter * pinned * shape;
}

vec4 effect(vec2 uv) {
    float seed = floor(time * speed);
    float limit = progress * resolution.x;
    float cell = floor(pixel.x / STEP);
    float distance = 1000.0;

    for (float i = -1.0; i <= 1.0; i += 1.0) {
        float from = cell + i;
        float to = from + 1.0;

        distance = min(distance, segment(pixel, vec2(from * STEP, boltY(from, seed, limit)), vec2(to * STEP, boltY(to, seed, limit))));
    }

    distance -= thickness / 2.0;

    float visible = step(pixel.x, limit);
    float core = line(distance) * visible;
    float aura = glow(distance, glowRadius) * visible;

    return vec4(mix(color.rgb, vec3(1.0), core), max(aura * color.a, core));
}
