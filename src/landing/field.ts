// The hero field (WebGL2): the shielded pool seen from above in daylight, full-bleed. Caustic
// light nets drift over a deep floor ruled like a ledger (the public board); the surface is a
// real ripple simulation (height field, ping-pong) that refracts the floor and throws sun
// sparkles. The pointer touches it, seals slam into it, sinking sheets and floating digits stir
// it. Paused offscreen and on hidden tabs; 30fps idle, 60 while something moves; one frame on
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
  c.g *= 0.988;
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
uniform sampler2D s; uniform vec2 texel; uniform vec2 res; uniform float time; uniform float hasSim;
uniform vec2 pointer; uniform float flash; uniform vec2 flashAt;
uniform vec3 cPool, cPool2, cWave, cGlint, cMist, cSeal, cSheet;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, r = 0.0; for (int i = 0; i < 4; i++) { r += a * noise(p); p *= 2.03; a *= 0.5; } return r; }

// caustic net: the edges between drifting Voronoi cells
float net(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 h = hash2(i + g);
    vec2 r = g + 0.5 + 0.42 * sin(t + 6.2831 * h) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  float e = sqrt(d2) - sqrt(d1);
  return pow(1.0 - smoothstep(0.0, 0.1, e), 2.4);
}

void main() {
  float aspect = res.x / res.y;
  vec2 q = vec2(v.x * aspect, v.y);

  // surface
  float h = 0.0, hx = 0.0, hy = 0.0;
  if (hasSim > 0.5) {
    h = texture(s, v).r;
    hx = texture(s, v + vec2(texel.x, 0.0)).r - texture(s, v - vec2(texel.x, 0.0)).r;
    hy = texture(s, v + vec2(0.0, texel.y)).r - texture(s, v - vec2(0.0, texel.y)).r;
  }
  float t = time;
  vec2 swell = vec2(fbm(q * 1.6 + vec2(t * 0.05, 0.0)), fbm(q * 1.6 + vec2(0.0, -t * 0.04))) - 0.5;
  vec2 bend = vec2(hx, hy) * 2.2 + swell * 0.05;

  // floor, seen through the water: deep blue, lighter where the sun sits (upper left)
  vec2 fq = q + bend;
  float sun = smoothstep(1.6, 0.0, length((v - vec2(0.18, 0.95)) * vec2(aspect, 1.0)));
  vec3 col = mix(cPool, cPool2, 0.35 + 0.65 * sun);
  col = mix(col, cWave, sun * 0.35);

  // the ledger on the floor: the public board's rules
  vec2 lg = fq * vec2(7.0, 14.0);
  float rows = 1.0 - smoothstep(0.0, 0.06, abs(fract(lg.y) - 0.5) * 2.0 - 0.94);
  float cols = 1.0 - smoothstep(0.0, 0.04, abs(fract(lg.x * 0.5) - 0.5) * 2.0 - 0.97);
  col = mix(col, cMist, max(rows, cols) * 0.06);

  // caustics: two nets, refracted by the surface, brighter near the sun
  // the nets are domain-warped so they read as water light, not a lattice
  vec2 wq = fq + (vec2(fbm(fq * 1.3 + t * 0.05), fbm(fq * 1.3 + 5.2 - t * 0.04)) - 0.5) * 0.7;
  float c1 = net(wq * 3.4 + vec2(t * 0.06, t * 0.03), t * 0.55);
  float c2 = net(wq * 5.6 - vec2(t * 0.04, -t * 0.05) + 3.7, t * 0.7 + 1.3);
  float caus = c1 * 0.45 + c2 * 0.3 + c1 * c2 * 1.1;
  caus *= 0.55 + 0.75 * sun;
  caus *= 1.0 + clamp(h * 18.0, -0.6, 2.0);
  vec3 light = mix(cWave, cGlint, 0.55 + 0.45 * sun);
  col += light * caus * 0.5;

  // the caught moment: the light near the press runs seal red for a beat
  float near = exp(-pow(length((v - flashAt) * vec2(aspect, 1.0)) / 0.42, 2.0));
  col = mix(col, cSeal, clamp(flash * near * (0.55 + caus * 1.2), 0.0, 0.85));

  // ripple slopes catch the sky; sun sparkles on crests
  vec3 n = normalize(vec3(-hx * 20.0 - swell.x * 0.18, -hy * 20.0 - swell.y * 0.18, 1.0));
  vec3 L = normalize(vec3(-0.5, 0.65, 0.55));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
  float glitter = step(0.985, noise(q * 90.0 + t * 0.6)) * smoothstep(0.25, 0.9, spec + swell.x * 2.0);
  col += cSheet * (spec * 0.45 + glitter * 0.5);
  col = mix(col, cGlint, clamp(length(vec2(hx, hy)) * 22.0, 0.0, 0.35));

  // the pointer's light, a soft lens
  float lens = exp(-pow(length((v - pointer) * vec2(aspect, 1.0)) / 0.16, 2.0));
  col += cGlint * lens * 0.08;

  // vignette and grain (12fps, like film)
  col *= mix(0.62, 1.0, smoothstep(1.25, 0.25, length((v - 0.5) * vec2(aspect * 0.8, 1.0))));
  float g = hash(floor(v * res / 1.5) + floor(t * 12.0) * 7.31) - 0.5;
  col += g * 0.035;
  o = vec4(col, 1.0);
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
  /// Drop into the pool at a point in CSS pixels relative to the canvas.
  drop(x: number, y: number, strength?: number, radius?: number): void;
  /// Runs the light near (x, y) seal red, fading over `ms`.
  flash(x: number, y: number, ms: number): void;
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

  const palette = ["cPool", "cPool2", "cWave", "cGlint", "cMist", "cSeal", "cSheet"];
  let render: ReturnType<typeof compile>;
  let sim: ReturnType<typeof compile> | null;
  let dropP: ReturnType<typeof compile> | null;
  try {
    render = compile(gl, VERT, RENDER, ["s", "texel", "res", "time", "hasSim", "pointer", "flash", "flashAt", ...palette]);
    sim = canFloat ? compile(gl, VERT, SIM, ["s", "texel"]) : null;
    dropP = canFloat ? compile(gl, VERT, DROP, ["s", "center", "radius", "strength", "aspect"]) : null;
  } catch {
    return null;
  }

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
    if (!sim) return;
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
  const tokens: Record<string, [number, number, number]> = {
    cPool: rgb(css.getPropertyValue("--pool")), cPool2: rgb(css.getPropertyValue("--pool-2")),
    cWave: rgb(css.getPropertyValue("--wave")), cGlint: rgb(css.getPropertyValue("--glint")),
    cMist: rgb(css.getPropertyValue("--mist")), cSeal: rgb(css.getPropertyValue("--seal")),
    cSheet: rgb(css.getPropertyValue("--sheet")),
  };

  let W = 1, H = 1;
  let quality = 1; // drops when frames run slow, so slow GPUs keep moving
  const pointer = { x: -10, y: -10 };
  const target = { x: -10, y: -10 };
  const vel = { x: 0, y: 0 };
  let lastFrame = 0;
  // spring-smoothed pointer (MASTER: stiffness 100, damping 18)
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
    const dpr = Math.min(phone ? 1 : 1.5, devicePixelRatio || 1) * quality;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    simW = Math.max(64, Math.round(W / 4));
    simH = Math.max(64, Math.round(H / 4));
    makeTargets();
    frame(performance.now(), true);
  };

  const step = () => {
    if (!sim || !tex.length) return;
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

  const uvOf = (x: number, y: number) => ({ u: x / W, v: 1 - y / H });

  const drop = (x: number, y: number, strength = 0.035, radius = 0.025, quiet = false) => {
    if (!dropP || !tex.length) return;
    const { u, v } = uvOf(x, y);
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

  // seal-red flash
  const fl = { at: { x: 0.5, y: 0.5 }, start: 0, ms: 1 };
  const flashLevel = (now: number) => {
    const k = (now - fl.start) / fl.ms;
    if (k < 0 || k > 1) return 0;
    return k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
  };

  const t0 = performance.now();
  let raf = 0;
  let last = 0;
  let awakeUntil = 0;
  let visible = true;
  let slow = 0;
  const wake = (ms = 1600) => {
    awakeUntil = Math.max(awakeUntil, performance.now() + ms);
    if (!raf && visible && !opts.reduced) raf = requestAnimationFrame(loop);
  };

  function frame(now: number, force = false) {
    if (!force && opts.reduced) return;
    follow(now);
    step();
    step();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(render.prog);
    gl.uniform2f(render.u.texel, 1 / simW, 1 / simH);
    gl.uniform2f(render.u.res, canvas.width, canvas.height);
    gl.uniform1f(render.u.time, opts.reduced ? 12 : (now - t0) / 1000);
    gl.uniform1f(render.u.hasSim, sim && tex.length ? 1 : 0);
    gl.uniform2f(render.u.pointer, pointer.x, pointer.y);
    gl.uniform1f(render.u.flash, flashLevel(now));
    gl.uniform2f(render.u.flashAt, fl.at.x, fl.at.y);
    for (const k of palette) gl.uniform3f(render.u[k], tokens[k][0], tokens[k][1], tokens[k][2]);
    gl.activeTexture(gl.TEXTURE0);
    if (tex[cur]) gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(render.u.s, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // the pool breathes: a soft drop somewhere every 1.4–2.4s
  let nextAmbient = 0;
  const ambient = (now: number) => {
    if (now < nextAmbient) return;
    nextAmbient = now + 1400 + Math.random() * 1000;
    drop(W * Math.random(), H * Math.random(), 0.03, 0.02, true); // stays at the idle 30fps
  };

  function loop(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    ambient(now);
    const awake = now < awakeUntil;
    const interval = awake ? 0 : 1000 / 30;
    if (now - last >= interval - 1) {
      // awake frames should land every ~16ms; a run of slow ones lowers the resolution
      if (awake && last) {
        slow = now - last > 24 ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 40 && quality > 0.5) {
          quality = Math.max(0.5, quality * 0.75);
          slow = 0;
          resize();
        }
      }
      last = now;
      frame(now);
    }
    raf = requestAnimationFrame(loop);
  }

  let lastTouch = 0;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (y < 0 || y > H) return;
    const { u, v } = uvOf(x, y);
    target.x = u;
    target.y = v;
    if (!opts.reduced) {
      const now = performance.now();
      if (now - lastTouch > 140) {
        lastTouch = now;
        drop(x, y, 0.04, 0.022);
      }
    }
    wake(600);
  };
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
    flash(x: number, y: number, ms: number) {
      const { u, v } = uvOf(x, y);
      fl.at = { x: u, y: v };
      fl.start = performance.now();
      fl.ms = ms;
      wake(ms);
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
