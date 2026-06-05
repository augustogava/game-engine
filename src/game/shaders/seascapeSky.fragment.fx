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
uniform vec3  horizonColor;
uniform vec3  nightZenithColor;

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

    vec3 e = dir;
    e.y = (max(e.y, 0.0) * 0.8 + 0.2) * 0.8;
    vec3 dayBase = vec3(pow(1.0 - e.y, 2.0), 1.0 - e.y, 0.6 + (1.0 - e.y) * 0.4) * 1.1;
    vec3 base = mix(nightZenithColor, dayBase, dayFactor);

    vec2 uv = e.xz / max(0.35, e.y + 1.0);
    float t = time * speed;
    float cl = fbm9(uv * scale + vec2(t, t * 0.77));
    float coverV = mix(-0.35, 0.35, cover);
    float clouds = smoothstep(coverV, coverV + 0.6, cl);
    float top = smoothstep(0.0, 0.8, e.y);
    clouds *= mix(0.3, 1.0, top);
    float cloudAmount = clamp(clouds * intensity, 0.0, 1.0);

    vec3 cCol = cloudColor * (0.25 + 0.75 * dayFactor);
    vec3 sky = mix(base, cCol, cloudAmount);

    float sun = clamp(dot(-sunDir, dir), 0.0, 1.0);
    sky += sunColor * pow(sun, 32.0) * 0.20 * dayFactor;
    sky += sunColor * pow(sun, 6.0) * 0.06 * dayFactor;

    float horizonW = 1.0 - smoothstep(0.0, 0.20, dir.y);
    sky = mix(sky, horizonColor, horizonW * 0.60);

    gl_FragColor = vec4(max(sky, 0.0), 1.0);
}
