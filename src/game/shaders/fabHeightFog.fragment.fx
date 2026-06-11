#ifdef GL_ES
precision highp float;
#endif

// Volumetric-style height fog: reconstructs world position from the depth
// buffer and applies exponential fog that thickens in valleys (low Y), with
// animated noise and dithering to avoid banding.

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec3 camPos;
uniform vec3 camForward;
uniform vec3 camRight;
uniform vec3 camUp;
uniform vec2 camTan;   // tan(fov/2) * aspect, tan(fov/2)
uniform vec2 camDepth; // near, far
uniform float time;
uniform vec3 fogColor;

const float FOG_BASE_Y = -1.5;
const float FOG_HEIGHT_FALLOFF = 0.22;
const float FOG_DIST_DENSITY = 0.012;
const float FOG_MAX = 0.55;
const float FOG_NOISE_SCALE = 0.045;
const float FOG_NOISE_SPEED = 0.06;
const float FOG_NOISE_AMOUNT = 0.5;
const float FOG_SKY_KEEP = 0.12;
const float FOG_DITHER = 0.008;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main(void) {
    vec4 base = texture2D(textureSampler, vUV);
    float depth = texture2D(depthSampler, vUV).r;

    vec2 ndc = vUV * 2.0 - 1.0;
    vec3 ray = camForward + camRight * ndc.x * camTan.x + camUp * ndc.y * camTan.y;
    float viewZ = camDepth.x + depth * (camDepth.y - camDepth.x);
    vec3 worldPos = camPos + ray * viewZ;
    float dist = length(ray) * viewZ;

    // Denser near the fog base plane, fading exponentially with altitude.
    float heightFactor = exp(-max(worldPos.y - FOG_BASE_Y, 0.0) * FOG_HEIGHT_FALLOFF);
    vec2 drift = vec2(time * FOG_NOISE_SPEED, time * FOG_NOISE_SPEED * 0.7);
    float n = vnoise(worldPos.xz * FOG_NOISE_SCALE + drift);
    heightFactor *= 1.0 - FOG_NOISE_AMOUNT * 0.5 + FOG_NOISE_AMOUNT * n;

    float distFactor = 1.0 - exp(-dist * FOG_DIST_DENSITY);
    float fog = clamp(distFactor * heightFactor, 0.0, FOG_MAX);

    // Depth buffer is cleared to 1.0: keep only a faint haze on the sky.
    float skyMask = step(0.9995, depth);
    fog *= mix(1.0, FOG_SKY_KEEP, skyMask);

    fog += (hash(vUV * 911.0 + fract(time)) - 0.5) * FOG_DITHER;
    gl_FragColor = vec4(mix(base.rgb, fogColor, clamp(fog, 0.0, 1.0)), base.a);
}
