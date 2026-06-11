#ifdef GL_ES
precision highp float;
#endif

varying vec3 vDir;

uniform float time;
uniform float cover;
uniform float intensity;
uniform float speed;
uniform float scale;
uniform float dayFactor;
uniform vec3  cloudColor;
uniform vec3  sunDir;
uniform vec3  sunColor;
uniform vec3  zenithColor;
uniform vec3  horizonColor;

float hash1(vec2 p) {
    p = 50.0 * fract(p * 0.3183099);
    return fract(p.x * p.y * (p.x + p.y));
}

float noiseIq(in vec2 x) {
    vec2 p = floor(x);
    vec2 w = fract(x);
    vec2 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
    float a = hash1(p + vec2(0.0, 0.0));
    float b = hash1(p + vec2(1.0, 0.0));
    float c = hash1(p + vec2(0.0, 1.0));
    float d = hash1(p + vec2(1.0, 1.0));
    return -1.0 + 2.0 * (a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y);
}

const mat2 m2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm9(in vec2 x) {
    float f = 1.9;
    float s = 0.55;
    float a = 0.0;
    float b = 0.5;
    for (int i = 0; i < 9; i++) {
        float n = noiseIq(x);
        a += b * n;
        b *= s;
        x = f * m2 * x;
    }
    return a;
}

void main(void) {
    vec3 dir = normalize(vDir);

    // Vertical gradient: dark stormy zenith fading to a smoky horizon.
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = mix(horizonColor, zenithColor, pow(h, 1.35));

    // Two cloud layers for parallax depth.
    vec3 e = dir;
    e.y = (max(e.y, 0.0) * 0.8 + 0.2) * 0.8;
    vec2 uv = e.xz / max(0.30, e.y + 1.0);
    float t = time * speed;
    float cl = fbm9(uv * scale + vec2(t, t * 0.77));
    cl += 0.5 * fbm9(uv * scale * 2.3 - vec2(t * 0.6, t * 0.4));
    float coverV = mix(-0.30, 0.40, cover);
    float clouds = smoothstep(coverV, coverV + 0.65, cl);
    float top = smoothstep(0.0, 0.85, e.y);
    clouds *= mix(0.25, 1.0, top);
    float cloudAmount = clamp(clouds * intensity, 0.0, 1.0);

    // Clouds catch a faint warm rim near the sun direction.
    float sun = clamp(dot(-sunDir, dir), 0.0, 1.0);
    vec3 cCol = cloudColor * (0.35 + 0.65 * dayFactor);
    cCol = mix(cCol, sunColor, pow(sun, 3.0) * 0.4);

    vec3 sky = mix(base, cCol, cloudAmount);

    // Sun bloom / glow on the open sky.
    sky += sunColor * pow(sun, 64.0) * 0.55;
    sky += sunColor * pow(sun, 8.0) * 0.10 * dayFactor;

    // Subtle horizon haze band.
    float horizonW = 1.0 - smoothstep(0.0, 0.18, dir.y);
    sky = mix(sky, horizonColor, horizonW * 0.55);

    gl_FragColor = vec4(max(sky, 0.0), 1.0);
}
