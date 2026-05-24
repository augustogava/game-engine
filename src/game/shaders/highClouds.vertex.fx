#ifdef GL_ES
precision highp float;
#endif

attribute vec3 position;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPos;

void main(void) {
    vec4 wp = world * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
