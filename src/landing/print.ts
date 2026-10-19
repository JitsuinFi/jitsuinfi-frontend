// A fingerprint grown from N (WebGL2): ridges round a core (a spiral whorl or a loop) that relax
// into arches toward the edge of the fingertip, with minutiae (ridge endings and forks), an
// uneven inked edge, ink pressure and paper grain, all seeded by N's 32 bytes. A new N moves the
// parameters, so the ridges flow from one print into the next instead of cutting over.

const VERT = `#version 300 es
in vec2 p; out vec2 v;
void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform vec2 res;
uniform vec2 core;
uniform float freq, blendR, ratio, tilt, spiral, seed, warpAmp, reveal, hot;
uniform vec4 warp;
uniform vec3 ink, hotInk;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  float aspect = res.y / res.x;
  vec2 p = (v - 0.5) * vec2(2.0, 2.0 * aspect);

  // the fingertip: an ellipse, rounder at the top, with a ragged inked edge
  vec2 m = p - vec2(0.0, 0.06 * aspect);
  float ry = m.y > 0.0 ? 0.98 * aspect : 0.86 * aspect;
  float e = length(m / vec2(0.86, ry));
  float rag = (noise(p * 7.0 + seed) - 0.5) * 0.1 + (noise(p * 23.0 + seed * 2.0) - 0.5) * 0.05;
  float edge = 1.0 - smoothstep(0.82, 1.0, e + rag);
  // pressed from the centre out
  edge *= 1.0 - smoothstep(reveal - 0.12, reveal, e);
  if (edge <= 0.001) { o = vec4(0.0); return; }

  // the skin's organic warp (two octaves), then the pattern frame round the core
  vec2 w = p + warpAmp * vec2(sin(p.y * 2.3 + warp.x) + 0.6 * sin(p.x * 3.1 + warp.y), sin(p.x * 2.1 + warp.z) + 0.6 * sin(p.y * 2.9 + warp.w));
  w += 0.035 * (vec2(noise(p * 2.2 + seed), noise(p * 2.2 + seed + 9.1)) - 0.5);
  float c = cos(tilt), s = sin(tilt);
  vec2 q = mat2(c, -s, s, c) * (w - core);

  // the core: rings (a whorl), turned into a spiral by whole ridge periods so the seam closes
  float ang = atan(q.x, -q.y);
  float rd = length(q * vec2(1.0, ratio));
  float ring = rd + spiral * (ang / 6.2831853) / freq;
  // the outer field follows the fingertip: arcs round a centre far below, so the ridges cap
  // over the top and run nearly level toward the crease
  vec2 fc = q - vec2(0.0, -1.3); // the centre sits below the fingertip, never inside it
  float arch = length(fc * vec2(0.68, 1.0)) - 1.3;
  arch -= 0.16 * q.x * q.x * smoothstep(-0.25, -0.85, q.y); // the lowest ridges follow the tip's base
  float k = smoothstep(blendR, blendR * 0.42, rd);
  float phase = mix(arch + blendR * 0.9, ring, k);

  // minutiae: smooth half-ridge shifts make forks and merges; the ridge narrowing to nothing
  // makes endings; the width breathes with pressure along each ridge
  float f = phase * freq;
  f += 0.5 * smoothstep(0.55, 0.78, noise(q * 3.4 + seed * 3.1));
  f += 0.5 * smoothstep(0.6, 0.82, noise(q * 5.2 + seed * 1.3 + 4.0));
  float d = abs(fract(f) - 0.5);
  float aa = fwidth(f) * 0.9;
  float width = 0.17 + 0.07 * noise(q * 9.0 + seed);
  width *= smoothstep(0.04, 0.16, noise(q * 6.5 + seed * 2.2)); // rare endings, no bald patches
  float ridge = 1.0 - smoothstep(width - aa, width + aa, d);
  // pores: small gaps along the ridges
  float pore = step(0.93, noise(vec2(f * 2.6, ang * 60.0 + rd * 48.0) + seed));
  ridge *= 1.0 - 0.6 * pore;

  // ink: pressure falls off toward the edge, a little uneven, on paper grain
  float pressure = (0.62 + 0.38 * noise(p * 2.6 + seed * 0.7)) * (0.78 + 0.22 * (1.0 - e));
  float grain = 0.86 + 0.14 * hash(floor(gl_FragCoord.xy));
  float a = clamp(ridge * edge * pressure * grain, 0.0, 1.0);
  vec3 col = mix(ink, hotInk, hot);
  o = vec4(col * a, a);
}`;

export interface PrintParams {
  core: [number, number];
  freq: number;
  blendR: number;
  ratio: number;
  tilt: number;
  spiral: number;
  seed: number;
  warpAmp: number;
  warp: [number, number, number, number];
}

/** Every parameter of the print comes from N's bytes, so each N has its own print. */
export function paramsOf(n: string): PrintParams {
  const b = Array.from({ length: 32 }, (_, i) => parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255);
  const tau = Math.PI * 2;
  return {
    core: [(b[0] - 0.5) * 0.18, 0.02 + (b[1] - 0.5) * 0.16],
    freq: 19 + b[2] * 4,
    blendR: 0.38 + b[3] * 0.22,
    ratio: 1.05 + b[4] * 0.4,
    tilt: (b[5] - 0.5) * 0.5,
    spiral: b[6] < 0.34 ? 0 : b[6] < 0.67 ? 1 : 2,
    seed: b[7] * 40 + b[8] * 3,
    warpAmp: 0.025 + b[9] * 0.04,
    warp: [b[10] * tau, b[11] * tau, b[12] * tau, b[13] * tau],
  };
}

export interface Print {
  el: HTMLCanvasElement;
  show(p: PrintParams, hot?: number, reveal?: number): void;
}

export function createPrint(colors: { ink: string; hot: string }): Print | null {
  const canvas = document.createElement("canvas");
  canvas.className = "fp-print";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  } catch {
    return null;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = Object.fromEntries(["res", "core", "freq", "blendR", "ratio", "tilt", "spiral", "seed", "warpAmp", "reveal", "hot", "warp", "ink", "hotInk"].map((n) => [n, U(n)]));
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.trim().replace("#", "").slice(i - 1, i + 1), 16) / 255) as [number, number, number];
  const ink = rgb(colors.ink);
  const hotC = rgb(colors.hot);

  let last: { p: PrintParams; hot: number; reveal: number } | null = null;
  const draw = () => {
    if (!last) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const { p, hot, reveal } = last;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniform2f(u.res, w, h);
    gl.uniform2f(u.core, p.core[0], p.core[1]);
    gl.uniform1f(u.freq, p.freq);
    gl.uniform1f(u.blendR, p.blendR);
    gl.uniform1f(u.ratio, p.ratio);
    gl.uniform1f(u.tilt, p.tilt);
    gl.uniform1f(u.spiral, p.spiral);
    gl.uniform1f(u.seed, p.seed);
    gl.uniform1f(u.warpAmp, p.warpAmp);
    gl.uniform1f(u.reveal, reveal);
    gl.uniform1f(u.hot, hot);
    gl.uniform4f(u.warp, ...p.warp);
    gl.uniform3f(u.ink, ...ink);
    gl.uniform3f(u.hotInk, ...hotC);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  new ResizeObserver(draw).observe(canvas);
  return {
    el: canvas,
    show(p, hot = 0, reveal = 1.3) {
      last = { p, hot, reveal };
      draw();
    },
  };
}

/** Interpolates two prints' parameters (the spiral steps, it is a count of ridges). */
export function mixParams(a: PrintParams, b: PrintParams, k: number): PrintParams {
  const l = (x: number, y: number) => x + (y - x) * k;
  // phases take the short way round
  const lp = (x: number, y: number) => {
    let d = y - x;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return x + d * k;
  };
  return {
    core: [l(a.core[0], b.core[0]), l(a.core[1], b.core[1])],
    freq: l(a.freq, b.freq),
    blendR: l(a.blendR, b.blendR),
    ratio: l(a.ratio, b.ratio),
    tilt: l(a.tilt, b.tilt),
    spiral: k < 0.5 ? a.spiral : b.spiral,
    seed: k < 0.5 ? a.seed : b.seed,
    warpAmp: l(a.warpAmp, b.warpAmp),
    warp: [lp(a.warp[0], b.warp[0]), lp(a.warp[1], b.warp[1]), lp(a.warp[2], b.warp[2]), lp(a.warp[3], b.warp[3])],
  };
}
