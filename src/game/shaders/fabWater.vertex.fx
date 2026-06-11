#ifdef GL_ES
precision highp float;
#endif

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec2 vUv;
varying vec3 vWorld;
varying vec4 vClip;

void main(void) {
    vUv = uv;
    vWorld = (world * vec4(position, 1.0)).xyz;
    vClip = worldViewProjection * vec4(position, 1.0);
    gl_Position = vClip;
}
