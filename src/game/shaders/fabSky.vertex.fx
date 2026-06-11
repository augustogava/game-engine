#ifdef GL_ES
precision highp float;
#endif

attribute vec3 position;

uniform mat4 worldViewProjection;

varying vec3 vDir;

void main(void) {
    vDir = position;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
