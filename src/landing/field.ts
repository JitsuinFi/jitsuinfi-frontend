// The hero field (WebGL2): cool document paper with faint fibers, torn open on one side where the
// shielded pool shows through. The pool is a real ripple simulation (height field, ping-pong):
// the pointer touches it, sinking glyphs drop into it, and two drops interfere into the proof.
// Paused offscreen and on hidden tabs; 30fps idle, 60 while something moves; one frame on
// reduced motion.

const VERT = `#version 300 es
in vec2 p; out vec2 v;
void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const SIM = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D s; uniform vec2 texel;
void main() {
  vec4 c = texture(s, v);
  float avg = (texture(s, v + vec2(texel.x, 0.0)).r + texture(s, v - vec2(texel.x, 0.0)).r
             + texture(s, v + vec2(0.0, texel.y)).r + texture(s, v - vec2(0.0, texel.y)).r) * 0.25;
  c.g += (avg - c.r) * 2.0;
  c.g *= 0.986;
  c.r += c.g;
  c.r *= 0.9985;
  o = c;
}`;

const DROP = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D s; uniform vec2 center; uniform float radius; uniform float strength; uniform float aspect;
void main() {
  vec4 c = texture(s, v);
  vec2 d = (v - center) * vec2(aspect, 1.0);
  float x = max(0.0, 1.0 - length(d) / radius);
  c.r += (0.5 - cos(x * 3.14159265) * 0.5) * strength;
  o = c;
}`;

const RENDER = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D s; uniform vec2 texel; uniform vec2 res; uniform float time;
uniform float edge; uniform float vertical; uniform vec2 pointer; uniform float hasSim;
uniform vec3 cPaper, cFiber, cFold, cPool, cPool2, cWave, cGlint, cSheet;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, r = 0.0; for (int i = 0; i < 4; i++) { r += a * noise(p); p *= 2.03; a *= 0.5; } return r; }

void main() {
  float aspect = res.x / res.y;
  // torn line: x (desktop) or y (phone), roughened by two octaves of noise
  float along = vertical > 0.5 ? v.y : v.x;
  float across = vertical > 0.5 ? v.x : 1.0 - v.y;
  float tear = edge + 0.022 * (fbm(vec2(along * 9.0, 3.1)) - 0.5) + 0.006 * (noise(vec2(along * 61.0, 7.7)) - 0.5);
  float d = across - tear;                 // > 0 inside the pool
  float px = 1.0 / (vertical > 0.5 ? res.x : res.y);

  // paper: cool ground, long faint fibers, a soft wick where the pointer rests
  vec2 q = v * vec2(aspect, 1.0);
  float fib = smoothstep(0.7, 0.95, fbm(vec2(q.x * 5.0, q.y * 140.0) + fbm(q * 4.0)));
  float specks = step(0.996, hash(floor(v * res / 2.0)));
  vec3 paper = cPaper;
  paper = mix(paper, cFiber, fib * 0.22);
  paper = mix(paper, cFold, specks * 0.25);
  float wick = exp(-pow(length((v - pointer) * vec2(aspect, 1.0)) / 0.09, 2.0)) * fbm(q * 18.0);
  paper = mix(paper, cFiber, wick * 0.5);
  // torn fringe: a band of whiter fibers on the paper side, and the paper's shadow on the water
  float fringe = smoothstep(-0.018, -0.002, d) * (1.0 - step(0.0, d));
  paper = mix(paper, cSheet, fringe * (0.55 + 0.45 * noise(vec2(along * 140.0, 1.0))));

  // water
  vec2 sv = v;
  float h = hasSim > 0.5 ? texture(s, sv).r : 0.0;
  float hx = hasSim > 0.5 ? texture(s, sv + vec2(texel.x, 0.0)).r - texture(s, sv - vec2(texel.x, 0.0)).r : 0.0;
  float hy = hasSim > 0.5 ? texture(s, sv + vec2(0.0, texel.y)).r - texture(s, sv - vec2(0.0, texel.y)).r : 0.0;
  float swell = fbm(vec2(q.x * 2.2 + time * 0.03, q.y * 2.2 - time * 0.02));
  vec3 n = normalize(vec3(-hx * 16.0 + (swell - 0.5) * 0.15, -hy * 16.0, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.6, 0.65));
  float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 28.0);
  float depth = clamp(d * 3.0, 0.0, 1.0);
  vec3 water = mix(cPool2, cPool, smoothstep(0.0, 0.9, depth + v.y * 0.35));
  water = mix(water, cWave, clamp(length(vec2(hx, hy)) * 30.0, 0.0, 0.8));
  water += cGlint * spec * 1.3;
  water += cGlint * smoothstep(0.012, 0.05, h) * 0.35;
  float caustic = smoothstep(0.78, 0.98, fbm(q * 6.0 + vec2(time * 0.05, 0.0) + n.xy * 3.0));
  water = mix(water, cWave, caustic * 0.3);
  water += cPool2 * (1.0 - depth) * 0.25;  // light from inside, near the tear
  float shade = smoothstep(0.0, 0.035, d);
  water *= mix(0.55, 1.0, shade);         // the paper's shadow on the water

  float inside = smoothstep(-px, px, d);
  o = vec4(mix(paper, water, inside), 1.0);
}`;

type Uniforms = Record<string, WebGLUniformLocation | null>;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string, names: string[]): { prog: WebGLProgram; u: Uniforms } {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, "p");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  const u: Uniforms = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}

function rgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export interface Field {
  /// Drop into the pool at a point in CSS pixels relative to the canvas. Ignored outside the pool.
  drop(x: number, y: number, strength?: number, radius?: number): void;
  /// Whether a point (CSS pixels) is in the pool.
  inPool(x: number, y: number): boolean;
  /// Moves the torn line: a fraction of the width (desktop) or of the height from the top (phone).
  setEdge(across: number): void;
  /// Keeps the loop at 60fps for a while (something is moving).
  wake(ms?: number): void;
  destroy(): void;
}

export function createField(canvas: HTMLCanvasElement, opts: { reduced: boolean }): Field | null {
  const ctx = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!ctx) return null;
  const gl: WebGL2RenderingContext = ctx;
  const canFloat = !!gl.getExtension("EXT_color_buffer_float");

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const render = compile(gl, VERT, RENDER, ["s", "texel", "res", "time", "edge", "vertical", "pointer", "hasSim", "cPaper", "cFiber", "cFold", "cPool", "cPool2", "cWave", "cGlint", "cSheet"]);
  const sim = canFloat ? compile(gl, VERT, SIM, ["s", "texel"]) : null;
  const dropP = canFloat ? compile(gl, VERT, DROP, ["s", "center", "radius", "strength", "aspect"]) : null;

  // ping-pong state textures (R = height, G = velocity)
  let simW = 2, simH = 2;
  const tex: WebGLTexture[] = [];
  const fbo: WebGLFramebuffer[] = [];
  let cur = 0;
  const makeTargets = () => {
    tex.forEach((t) => gl.deleteTexture(t));
    fbo.forEach((f) => gl.deleteFramebuffer(f));
    tex.length = 0;
    fbo.length = 0;
    if (!canFloat) return;
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, simW, simH, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      tex.push(t);
      fbo.push(f);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const css = getComputedStyle(document.documentElement);
  const color = (n: string) => rgb(css.getPropertyValue(n));
  const palette = {
    cPaper: color("--paper"), cFiber: color("--fiber"), cFold: color("--fold"), cPool: color("--pool"),
    cPool2: color("--pool-2"), cWave: color("--wave"), cGlint: color("--glint"), cSheet: color("--sheet"),
  };

  let W = 1, H = 1, dpr = 1, vertical = 0, edgeAt = 0.6, edgeSet = 0;
  const pointer = { x: -10, y: -10 };
  const target = { x: -10, y: -10 };
  const vel = { x: 0, y: 0 };
  let lastFrame = 0;
  const follow = (now: number) => {
    const dt = Math.min(0.05, lastFrame ? (now - lastFrame) / 1000 : 0);
    lastFrame = now;
    if (pointer.x < -5) {
      pointer.x = target.x;
      pointer.y = target.y;
      return;
    }
    for (const k of ["x", "y"] as const) {
      const a = 100 * (target[k] - pointer[k]) - 18 * vel[k];
      vel[k] += a * dt;
      pointer[k] += vel[k] * dt;
    }
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    const phone = W < 760;
    dpr = Math.min(phone ? 1 : 2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    vertical = phone ? 0 : 1;
    edgeAt = edgeSet || (phone ? 0.42 : 0.6); // phone: pool fills the lower part; desktop: the right 40%
    simW = Math.max(64, Math.round(W / 4));
    simH = Math.max(64, Math.round(H / 4));
    makeTargets();
    frame(performance.now(), true);
  };

  const step = () => {
    if (!sim) return;
    gl.viewport(0, 0, simW, simH);
    gl.useProgram(sim.prog);
    gl.uniform2f(sim.u.texel, 1 / simW, 1 / simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(sim.u.s, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    cur = 1 - cur;
  };

  // The shader roughens the tear; JS hit tests use the mean line.
  const toUV = (x: number, y: number) => ({ u: x / W, v: 1 - y / H });
  const inPool = (x: number, y: number) => {
    const { u, v } = toUV(x, y);
    const across = vertical ? u : 1 - v;
    return across > edgeAt + 0.012;
  };

  const drop = (x: number, y: number, strength = 0.035, radius = 0.025, quiet = false) => {
    if (!dropP || !inPool(x, y)) return;
    const { u, v } = toUV(x, y);
    gl.viewport(0, 0, simW, simH);
    gl.useProgram(dropP.prog);
    gl.uniform2f(dropP.u.center, u, v);
    gl.uniform1f(dropP.u.radius, radius);
    gl.uniform1f(dropP.u.strength, strength);
    gl.uniform1f(dropP.u.aspect, W / H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(dropP.u.s, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    cur = 1 - cur;
    if (!quiet) wake();
  };

  const t0 = performance.now();
  let raf = 0;
  let last = 0;
  let awakeUntil = 0;
  let visible = true;
  const wake = (ms = 1600) => {
    awakeUntil = Math.max(awakeUntil, performance.now() + ms);
    if (!raf && visible && !opts.reduced) raf = requestAnimationFrame(loop);
  };

  function frame(now: number, force = false) {
    if (!force && opts.reduced) return;
    follow(now);
    if (sim) {
      step();
      step();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(render.prog);
    gl.uniform2f(render.u.texel, 1 / simW, 1 / simH);
    gl.uniform2f(render.u.res, canvas.width, canvas.height);
    gl.uniform1f(render.u.time, opts.reduced ? 0 : (now - t0) / 1000);
    gl.uniform1f(render.u.edge, edgeAt);
    gl.uniform1f(render.u.vertical, vertical);
    gl.uniform2f(render.u.pointer, pointer.x, pointer.y);
    gl.uniform1f(render.u.hasSim, sim ? 1 : 0);
    for (const [k, c] of Object.entries(palette)) gl.uniform3f(render.u[k], c[0], c[1], c[2]);
    gl.activeTexture(gl.TEXTURE0);
    if (tex[cur]) gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(render.u.s, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // the pool breathes: a soft drop somewhere every 1.8–3s
  let nextAmbient = 0;
  const ambient = (now: number) => {
    if (now < nextAmbient) return;
    nextAmbient = now + 1800 + Math.random() * 1200;
    for (let i = 0; i < 6; i++) {
      const x = W * Math.random();
      const y = H * Math.random();
      if (inPool(x, y)) {
        drop(x, y, 0.03, 0.02, true); // ambient: stays at the idle 30fps
        return;
      }
    }
  };

  function loop(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    ambient(now);
    const active = now < awakeUntil;
    const interval = active ? 0 : 1000 / 30;
    if (now - last >= interval - 1) {
      last = now;
      frame(now);
    }
    raf = requestAnimationFrame(loop);
  }

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const { u, v } = toUV(x, y);
    target.x = u;
    target.y = v;
    if (!opts.reduced && inPool(x, y)) {
      const now = performance.now();
      if (now - lastTouch > 140) {
        lastTouch = now;
        drop(x, y, 0.04, 0.022);
      }
    }
    wake(600);
  };
  let lastTouch = 0;
  window.addEventListener("pointermove", onMove, { passive: true });

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) wake(400);
  });
  io.observe(canvas);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const onVis = () => {
    if (!document.hidden) wake(400);
  };
  document.addEventListener("visibilitychange", onVis);
  resize();
  if (!opts.reduced) wake(2000);

  return {
    drop,
    inPool,
    setEdge(across: number) {
      edgeSet = edgeAt = across;
      frame(performance.now(), true);
    },
    wake,
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    },
  };
}
