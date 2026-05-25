#ifdef GL_ES
precision highp float;
#endif

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform sampler2D noiseSampler;
uniform sampler2D blueNoiseSampler;

uniform mat4 invViewProj;
uniform vec3 cameraPos;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 ambientColor;
uniform float time;
uniform float cloudBaseAlt;
uniform float cloudTopAlt;
uniform float cloudCoverage;
uniform float cloudDensity;
uniform float farClipZ;
uniform vec2 windOffset;
uniform vec2 screenSize;

#define NOISE_SLICES 128.0
#define MAX_STEPS 64
#define LIGHT_STEPS 6
#define EPS 0.0001

vec4 sample3D(vec3 uvw) {
    uvw.x = fract(uvw.x);
    uvw.y = fract(uvw.y);
    uvw.z = fract(uvw.z);
    float slice = uvw.z * (NOISE_SLICES - 1.0);
    float s0 = floor(slice);
    float sf = slice - s0;
    vec2 uv0 = vec2(uvw.x, (s0 + uvw.y) / NOISE_SLICES);
    vec2 uv1 = vec2(uvw.x, (s0 + 1.0 + uvw.y) / NOISE_SLICES);
    vec4 a = texture2D(noiseSampler, uv0);
    vec4 b = texture2D(noiseSampler, uv1);
    return mix(a, b, sf);
}

float cloudDensityAt(vec3 p) {
    float layerH = max(1.0, cloudTopAlt - cloudBaseAlt);
    float h = (p.y - cloudBaseAlt) / layerH;
    if (h < 0.0 || h > 1.0) return 0.0;
    float shape = smoothstep(0.0, 0.18, h) * smoothstep(1.0, 0.82, h);
    vec3 wp = p + vec3(windOffset.x, 0.0, windOffset.y);
    vec3 uvw = wp / 2000.0;
    vec4 n  = sample3D(uvw * 0.6);
    vec4 nd = sample3D(uvw * 3.4 + vec3(time * 0.0008, 0.0, 0.0));
    float base = n.r * 0.6 + n.g * 0.3 + n.b * 0.1;
    base = clamp((base - (1.0 - cloudCoverage)) / max(cloudCoverage, 0.001), 0.0, 1.0);
    float detail = nd.r * 0.5 + nd.g * 0.3 + nd.b * 0.2;
    float d = max(0.0, base - detail * 0.35);
    return d * shape * cloudDensity;
}

float henyeyGreenstein(float cosA, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (12.566 * pow(max(0.001, 1.0 + g2 - 2.0 * g * cosA), 1.5));
}

float lightMarch(vec3 p, vec3 lDir) {
    float trans = 1.0;
    float step = (cloudTopAlt - cloudBaseAlt) / float(LIGHT_STEPS) * 0.6;
    for (int i = 0; i < LIGHT_STEPS; i++) {
        p += lDir * step;
        float d = cloudDensityAt(p);
        trans *= exp(-d * step * 0.04);
        if (trans < 0.01) break;
    }
    return trans;
}

vec3 worldRay(vec2 uv) {
    vec4 clipNear = vec4(uv * 2.0 - 1.0, -1.0, 1.0);
    vec4 clipFar  = vec4(uv * 2.0 - 1.0,  1.0, 1.0);
    vec4 wNear = invViewProj * clipNear; wNear.xyz /= wNear.w;
    vec4 wFar  = invViewProj * clipFar;  wFar.xyz  /= wFar.w;
    return normalize(wFar.xyz - wNear.xyz);
}

float linearSceneDistance(vec2 uv, vec3 rayDirW, vec3 camForwardW) {
    float d = texture2D(depthSampler, uv).r;
    if (d >= 0.999) return 1.0e8;
    float viewZ = d * farClipZ;
    float c = dot(rayDirW, camForwardW);
    return viewZ / max(c, 0.001);
}

void main(void) {
    vec4 sceneColor = texture2D(textureSampler, vUV);
    vec3 rayDir = worldRay(vUV);

    if (abs(rayDir.y) < EPS) { gl_FragColor = sceneColor; return; }

    float tBase = (cloudBaseAlt - cameraPos.y) / rayDir.y;
    float tTop  = (cloudTopAlt  - cameraPos.y) / rayDir.y;
    float tEnter = min(tBase, tTop);
    float tExit  = max(tBase, tTop);

    if (cameraPos.y > cloudBaseAlt && cameraPos.y < cloudTopAlt) tEnter = 0.0;
    else tEnter = max(tEnter, 0.0);

    if (tExit <= 0.0 || tEnter >= tExit) { gl_FragColor = sceneColor; return; }

    vec3 camForwardW = worldRay(vec2(0.5, 0.5));
    float sceneDist = linearSceneDistance(vUV, rayDir, camForwardW);
    tExit = min(tExit, sceneDist);
    if (tEnter >= tExit) { gl_FragColor = sceneColor; return; }

    float dt = (tExit - tEnter) / float(MAX_STEPS);
    vec2 bnUv = (vUV * screenSize) / 64.0;
    float dither = texture2D(blueNoiseSampler, bnUv).r;
    float t = tEnter + dither * dt;

    vec3 lDir = -normalize(sunDir);
    float cosA = dot(rayDir, lDir);
    float hgF = max(1.0, henyeyGreenstein(cosA, 0.6) * 12.0);

    vec3 accumColor = vec3(0.0);
    float trans = 1.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        if (t >= tExit || trans < 0.01) break;
        vec3 p = cameraPos + rayDir * t;
        float d = cloudDensityAt(p);
        if (d > 0.001) {
            float lightT = lightMarch(p, lDir);
            vec3 lit = sunColor * lightT * hgF + ambientColor;
            float dT = exp(-d * dt * 0.04);
            accumColor += trans * lit * (1.0 - dT);
            trans *= dT;
        }
        t += dt;
    }

    vec3 finalColor = sceneColor.rgb * trans + accumColor;
    gl_FragColor = vec4(finalColor, 1.0);
}
