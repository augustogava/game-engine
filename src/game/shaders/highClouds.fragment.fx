#ifdef GL_ES
precision highp float;
#endif

varying vec3 vWorldPos;

uniform float time;
uniform float cover;
uniform float speed;
uniform float scale;
uniform float noiseUvScale;
uniform float alpha;
uniform float reflectAmount;
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
    vec2 uv  = vWorldPos.xz * (noiseUvScale * scale);
    vec2 mov = vec2(time * speed, time * speed * 0.5);
    float cl = fbm9(uv + mov);
    float dl = smoothstep(-0.2 + 0.4 * cover, 0.6, cl);
    if (dl < 0.005) discard;

    vec3 viewDir = normalize(vWorldPos - cameraPos);

    float horizonFade = 1.0 - clamp(abs(viewDir.y) * 1.4, 0.0, 1.0);
    horizonFade = horizonFade * horizonFade;

    vec3 cloudCol = mix(cloudColor, vec3(1.0), reflectAmount);
    float sunAlt  = clamp(-sunDir.y * 1.5 + 0.25, 0.0, 1.0);
    cloudCol *= 0.78 + 0.32 * sunAlt;

    float sun = clamp(dot(-sunDir, viewDir), 0.0, 1.0);
    cloudCol += 0.35 * sunColor * pow(sun, 16.0);
    cloudCol += 0.18 * sunColor * pow(sun, 4.0) * sunAlt;

    cloudCol = mix(cloudCol, horizonColor, horizonFade * 0.55);

    float finalAlpha = dl * alpha * (0.4 + 0.6 * clamp(abs(viewDir.y) * 2.5, 0.0, 1.0));

    gl_FragColor = vec4(cloudCol, finalAlpha);
}
