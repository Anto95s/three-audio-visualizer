export const fragmentShader = `
#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;
uniform vec2 u_resolution;
uniform bool u_theme; // true = dark, false = light
uniform float u_bass; // 0..1 smoothed low-frequency audio level
uniform float u_mid; // 0..1 smoothed mid-band audio level
uniform float u_treble; // 0..1 smoothed high-band audio level
uniform vec3 u_colorA; // album cover average color
uniform vec3 u_colorB; // album cover vibrant accent color

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(
    mix(hash(i), hash(i+vec2(1.0,0.0)), u.x),
    mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x),
    u.y
  );
}

float grain(vec2 uv, float t) {
  return hash(uv * u_resolution.xy + t) - 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  float t = u_time * (0.22 + u_bass * 0.2 + u_mid * 0.1);

  // low end drives the big slow warp, like the fluid breathing with the beat
  vec2 warp = vec2(
    noise(uv * 1.0 + t * 0.8),
    noise(uv * 1.0 - t * 0.8)
  );
  uv += (warp - 0.5) * (0.42 + u_bass * 0.3);

  // mid frequencies add a second, faster-drifting layer for a more natural, less one-note dance
  vec2 warp2 = vec2(
    noise(uv * 2.1 - t * 1.4 + 11.0),
    noise(uv * 2.1 + t * 1.4 - 11.0)
  );
  uv += (warp2 - 0.5) * u_mid * 0.4;

  // lower-frequency waves for a gentler, more gradient-like look
  float f1 = sin(uv.x * 1.6 + t);
  float f2 = sin(uv.y * 2.2 - t * 0.9);
  float f3 = sin(length(uv) * 2.0 - t * 0.9);
  float f4 = sin((uv.x + uv.y) * 1.2 + t * 0.4);

  float field = (f1 + f2 + f3 + f4) * 0.25;
  field = smoothstep(-0.65, 0.65, field);

  float core = abs(field - 0.5);
  float solidMask = smoothstep(0.30, 0.05, core);

  float mViolet = smoothstep(0.26, 0.80, sin(field * 4.2 - t * 0.8));
  float mMetal  = smoothstep(0.26, 0.86, sin(field * 3.4 + t * 0.6));
  float sheen   = pow(abs(sin(field * 5.4 + t * 1.0)), 2.0);

  vec3 col;

  if(u_theme) {
    // DARK THEME: cover colors tinted dark, kept graphite/moody
    vec3 base   = u_colorA * 0.06;
    vec3 metal  = mix(u_colorA, vec3(0.2), 0.55) + 0.06;
    vec3 violet = u_colorA * 0.5 + 0.05;
    vec3 pink   = u_colorB * 0.55 + 0.05;
    // add a broad vertical gradient to prioritize smooth shading
    float largeGrad = smoothstep(-0.9, 0.9, uv.y * 0.6 + 0.5);

    col = mix(base, mix(violet, pink, 0.45 + 0.5 * sin(t + field * 2.2)), largeGrad * 0.45);

    vec3 metalCol = metal + sheen * 0.22;
    col = mix(col, metalCol, 0.65 * mMetal + solidMask * 0.14);

    float edge = smoothstep(0.36, 0.56, field);
    col += edge * 0.035;
  } else {
    // LIGHT THEME: cover colors kept pastel/bright
    vec2 flowDir;
    flowDir.x = noise(uv * 1.1 + t * 0.6);
    flowDir.y = noise(uv * 1.1 - t * 0.6);
    uv += (flowDir - 0.5) * 0.36;

    float flow = sin(field * 5.0 - t * 1.1);
    flow = smoothstep(-0.5, 0.9, flow);

    vec3 ice     = mix(vec3(0.94, 0.97, 1.00), u_colorA, 0.30);
    vec3 cyan    = mix(vec3(0.62, 0.92, 1.00), u_colorA, 0.55);
    vec3 blue    = mix(vec3(0.36, 0.60, 0.94), u_colorB, 0.6);
    vec3 violet  = mix(vec3(0.60, 0.50, 0.86), u_colorB, 0.6);

    // broad gradient driven by vertical position for smooth transitions
    float largeGrad = smoothstep(-0.95, 0.95, uv.y * 0.6 + 0.5);

    col = mix(ice, cyan, field * 0.45);
    col = mix(col, blue, flow * 0.35);
    col = mix(col, violet, mViolet * 0.18 + largeGrad * 0.08);

    float veins = sin(uv.x * 3.8 + t) * sin(uv.y * 3.6 - t * 0.8);
    veins = smoothstep(0.30, 0.70, veins * 0.5 + 0.5);

    col += veins * vec3(0.035, 0.04, 0.045);

    float pulse = sin(t + field * 2.8) * 0.5 + 0.5;
    col += pulse * 0.038;

    float edge = smoothstep(0.38, 0.58, field);
    col += edge * 0.045;
  }

  float g1 = grain(gl_FragCoord.xy / u_resolution.xy, u_time);
  float g2 = grain(gl_FragCoord.xy / u_resolution.xy * 0.5, u_time * 0.7);
  float g = g1 * 0.6 + g2 * 0.4;
  col += g * (0.04 + u_treble * 0.05);

  // treble adds a faint high-frequency shimmer instead of a hard beat flash
  col += u_treble * 0.03;

  gl_FragColor = vec4(col,1.0);
}
`