#ifdef GL_ES
precision highp float;
#endif

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPos;
varying vec2 vUV;

void main(void) {
    vec4 wp = world * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vUV = uv;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
