#ifdef GL_ES
precision highp float;
#endif

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec2 vUv;
varying vec3 vWorld;

void main(void) {
    vUv = uv;
    vWorld = (world * vec4(position, 1.0)).xyz;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
