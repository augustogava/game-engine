#ifdef GL_ES
precision highp float;
#endif

varying vec2 vUv;
varying vec3 vWorld;

uniform float time;
uniform float lava;
uniform vec3  cameraPosition;
uniform vec3  sunDir;
uniform vec3  baseColor;
uniform vec3  tintColor;

const int ITER = 4;
const float PI = 3.141592;

float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return -1.0 + 2.0 * mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float seaOctave(vec2 uv, float choppy) {
    uv += noise(uv);
    vec2 wv = 1.0 - abs(sin(uv));
    vec2 swv = abs(cos(uv));
    wv = mix(wv, swv, wv);
    return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
}

const mat2 octave_m = mat2(1.6, 1.2, -1.2, 1.6);

float mapHeight(vec2 p, float t) {
    float freq = 0.45;
    float amp = 0.6;
    float choppy = 4.0;
    vec2 uv = p;
    uv.x *= 0.75;
    float h = 0.0;
    for (int i = 0; i < ITER; i++) {
        float d = seaOctave((uv + t) * freq, choppy);
        d += seaOctave((uv - t) * freq, choppy);
        h += d * amp;
        uv *= octave_m;
        freq *= 1.9;
        amp *= 0.22;
        choppy = mix(choppy, 1.0, 0.2);
    }
    return h;
}

void main(void) {
    float t = 1.0 + time * 0.7;
    vec2 p = vWorld.xz;

    float eps = 0.06;
    float h = mapHeight(p, t);
    float hx = mapHeight(p + vec2(eps, 0.0), t);
    float hz = mapHeight(p + vec2(0.0, eps), t);
    vec3 n = normalize(vec3(h - hx, eps * 2.2, h - hz));

    vec3 eye = normalize(cameraPosition - vWorld);
    float fresnel = clamp(1.0 - dot(n, eye), 0.0, 1.0);
    fresnel = pow(fresnel, 3.0);

    vec3 sky = mix(baseColor, tintColor, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 deep = baseColor * 0.5;
    vec3 color = mix(deep, sky, fresnel);

    vec3 l = normalize(-sunDir);
    float spec = pow(max(dot(reflect(-eye, n), l), 0.0), 60.0);
    color += vec3(1.0, 0.95, 0.85) * spec * (1.0 - lava * 0.6);

    // Lava: glowing emissive cracks driven by the same height field.
    float glow = smoothstep(0.2, 0.9, h);
    vec3 lavaCol = mix(vec3(0.35, 0.05, 0.0), vec3(1.0, 0.55, 0.12), glow);
    color = mix(color, lavaCol, lava);

    float alpha = mix(0.82, 1.0, lava);
    gl_FragColor = vec4(max(color, 0.0), alpha);
}
