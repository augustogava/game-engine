#ifdef GL_ES
precision highp float;
#endif

varying vec3 vWorldPos;
varying vec2 vUV;

uniform float time;
uniform float cover;
uniform float alpha;
uniform float reflectAmount;
uniform float noiseScroll;
uniform float noiseDetailX;
uniform float noiseDetailY;
uniform float headFadeEnd;
uniform float tailFadeStart;
uniform float distFadeStart;
uniform float distFadeEnd;
uniform vec3  cloudColor;
uniform vec3  sunDir;
uniform vec3  sunColor;
uniform vec3  cameraPos;
uniform vec3  horizonColor;

float hash1(vec2 p) {
    p = 50.0 * fract(p * 0.3183099);
    return fract(p.x * p.y * (p.x + p.y));
}

float noise2(in vec2 x) {
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
        float n = noise2(x);
        a += b * n;
        b *= s;
        x = f * m2 * x;
    }
    return a;
}

void main(void) {
    vec2 nuv = vec2(vUV.x * noiseDetailX + time * noiseScroll, vUV.y * noiseDetailY);
    float cl = fbm9(nuv);
    float mask = smoothstep(-0.2 + 0.4 * cover, 0.6, cl);
    if (mask < 0.005) discard;

    float headFade = smoothstep(0.0, headFadeEnd, vUV.x);
    float tailFade = 1.0 - smoothstep(tailFadeStart, 1.0, vUV.x);
    float widthFade = smoothstep(0.0, 0.18, vUV.y) * (1.0 - smoothstep(0.82, 1.0, vUV.y));

    float distXZ = length(vWorldPos.xz - cameraPos.xz);
    float distFade = 1.0 - smoothstep(distFadeStart, distFadeEnd, distXZ);
    if (distFade <= 0.001) discard;

    vec3 viewDir = normalize(vWorldPos - cameraPos);

    vec3 cloudCol = mix(cloudColor, vec3(1.0), reflectAmount);
    float sunAlt  = clamp(-sunDir.y * 1.5 + 0.25, 0.0, 1.0);
    cloudCol *= 0.78 + 0.32 * sunAlt;

    float sun = clamp(dot(-sunDir, viewDir), 0.0, 1.0);
    cloudCol += 0.35 * sunColor * pow(sun, 16.0);
    cloudCol += 0.18 * sunColor * pow(sun, 4.0) * sunAlt;

    float vAbsY = abs(viewDir.y);
    float horizonFade = 1.0 - clamp(vAbsY * 1.4, 0.0, 1.0);
    horizonFade = horizonFade * horizonFade;
    cloudCol = mix(cloudCol, horizonColor, horizonFade * 0.45);

    float finalAlpha = mask * alpha * headFade * tailFade * widthFade * distFade;
    if (finalAlpha < 0.003) discard;

    gl_FragColor = vec4(cloudCol, finalAlpha);
}
