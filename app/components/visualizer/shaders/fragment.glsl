varying float vPattern;

uniform vec3 uColor;
uniform float uBass;
uniform float uTreble;

void main() {
    vec3 color = vPattern * uColor;

    // bass brightens the whole surface, treble adds a light shimmer, so the color itself reacts to the music
    color += uBass * 0.6;
    color += uTreble * 0.15;

    csm_DiffuseColor = vec4(color, 1.);
}