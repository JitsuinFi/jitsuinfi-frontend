// "Kota Piutang", the receivables town (MASTER Amendment 3): a square diorama on a strict grid,
// floating over a sea of clouds in an anime afternoon. Cel-shaded (three-step toon ramp) with ink
// lines drawn by an edge pass (normals and depth), so every outline is the same weight. Facades,
// signs, the public board and the calendar are painted on canvases, so the details read: framed
// windows, doors, bilingual signs (English and kanji), and the board's real fingerprints N.
// The director drives the story through plain setters.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const token = (n: string) => new THREE.Color(cssVar(n));

export type BoardState = "off" | "lit" | "caught" | "settled";

/** A view: the island turns (rot) so the subject faces a fixed 3/4 camera that dollies (zoom). */
export interface View {
  rot: number;
  zoom: number;
  look: [number, number, number];
}

/** From the subject toward the camera. */
export const CAM_DIR = new THREE.Vector3(0.34, 0.62, 1).normalize();

/** Where things are (island coordinates) and which way their fronts face (radians, 0 = +z). */
export const PLACES = {
  supplier: { at: new THREE.Vector3(-9.2, 0, -9.4), face: 0 },
  buyer: { at: new THREE.Vector3(9.2, 0, -9.4), face: 0 },
  tower: { at: new THREE.Vector3(0, 0, -1.6), face: 0 },
  vault: { at: new THREE.Vector3(-0.2, 0, 3.4), face: 0 },
  bankA: { at: new THREE.Vector3(-9.2, 0, 9.4), face: Math.PI },
  bankB: { at: new THREE.Vector3(9.2, 0, 9.4), face: Math.PI },
};

export interface City {
  /** the truck on its loop: 0 at the workshop, `shopStop` at the shop, 1 home again */
  truck(t: number): void;
  shopStop: number;
  /** the invoice as a paper plane: to the shop, to the vault; t outside 0..1 hides it */
  plane(route: "shop" | "vault", t: number): void;
  copyPlane(t: number, bounced?: number): void;
  /** the flat invoice in front of the shop; sealed 0..1 */
  sheet(shown: boolean, sealed: number): void;
  /** the jitsuin: 0 up, 1 pressed; squash 0..1 */
  stamp(down: number, squash?: number): void;
  /** anime impact lines around the press, 0..1 */
  burst(k: number): void;
  /** N rising from the sheet to the board; t outside 0..1 hides it */
  fingerprint(t: number): void;
  board(state: BoardState): void;
  vaultDoor(open: number): void;
  beam(bank: "A" | "B", k: number, caught?: boolean): void;
  shutterB(closed: number): void;
  /** a verdict stamp above the town, 0..1 */
  verdict(kind: "registered" | "refused" | "settled", k: number): void;
  stream(kind: "advance" | "pay", t: number): void;
  calendar(days: number): void;
  /** a figure's reaction: wave (supplier), cheer (buyer), shake (financier B), 0..1 */
  react(who: "supplier" | "buyer" | "bankA" | "bankB", k: number): void;
  shake(k: number): void;
  camera(view: View, parallax?: { x: number; y: number }, distance?: number): void;
  frame(now: number): void;
  resize(): void;
  canvas: HTMLCanvasElement;
}

/** The public board's earlier entries: real N of TES-INV-0001..0006, the buyer's paid history (`node scripts/landing-keys.mjs src/wasm`). */
const BOARD_ROWS = [
  "2eca708ec630786e19eaed4732378548ec6a85084c8a0a0c5bee002b158db0d0",
  "43a49aba3f76f720bf521ae045cf27409ced33cdcd46a262d3a74a03217b20f9",
  "f1f00264bacbbae7004334a7442785487525c32cd7743e690e8b575e5bf8bea8",
  "4a22c4711f17407db9e00447ce3d3944304fb6c5df1069be8355fb080c48659d",
  "c0ebb10b178bc4d57d0cad8a47877042e52378917e76c40bae08d624fcf746b8",
  "5f8680d26412c62a65dfc9b9182d17b0a12d3c809c8204aa0c8709f6e522f9f5",
];

const FX = 1; // render layer for things with no ink line (sky, light, labels)

type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTex(w: number, h: number, paint: Paint): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function repaint(t: THREE.CanvasTexture, paint: Paint) {
  const c = t.image as HTMLCanvasElement;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  paint(g, c.width, c.height);
  t.needsUpdate = true;
}

export function createCity(host: HTMLElement, opts: { reduced: boolean; n: string }): City | null {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-field";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const hex = {
    paper: cssVar("--paper"), sheet: cssVar("--sheet"), fiber: cssVar("--fiber"), fold: cssVar("--fold"),
    head: cssVar("--head"), ink: cssVar("--ink"), ink2: cssVar("--ink-2"), seal: cssVar("--seal"), sealHi: cssVar("--seal-hi"),
    pool: cssVar("--pool"), pool2: cssVar("--pool-2"), wave: cssVar("--wave"), glint: cssVar("--glint"), mist: cssVar("--mist"),
  };
  const C = {
    paper: token("--paper"), sheet: token("--sheet"), fiber: token("--fiber"), fold: token("--fold"),
    head: token("--head"), ink: token("--ink"), seal: token("--seal"), sealHi: token("--seal-hi"),
    pool: token("--pool"), pool2: token("--pool-2"), wave: token("--wave"), glint: token("--glint"), mist: token("--mist"),
  };
  const mix = (a: THREE.Color, b: THREE.Color, k: number) => a.clone().lerp(b, k);
  const F = {
    display: '"Shippori Mincho B1", "Hiragino Mincho ProN", serif',
    body: '"Geist Variable", "Geist", system-ui, sans-serif',
    mono: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
  };

  const ramp = (() => {
    const t = new THREE.DataTexture(new Uint8Array([158, 212, 255]), 3, 1, THREE.RedFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  })();
  const toon = (color: THREE.Color | string, map?: THREE.Texture) =>
    new THREE.MeshToonMaterial(map ? { color: 0xffffff, map, gradientMap: ramp } : { color, gradientMap: ramp });
  const light = (color: THREE.Color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity >= 1 });

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(mix(C.paper, C.mist, 0.4), 70, 170);

  // ---------- sky ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: mix(C.glint, C.wave, 0.3) },
        mid: { value: mix(C.mist, C.glint, 0.38) },
        low: { value: C.paper.clone() },
        sun: { value: new THREE.Vector3(-0.6, 0.38, -0.7).normalize() },
        sunC: { value: C.sheet.clone() },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 top, mid, low, sun, sunC; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(low, mid, smoothstep(-0.1, 0.22, h));
          c = mix(c, top, smoothstep(0.18, 0.8, h));
          float s = max(dot(vDir, sun), 0.0);
          c += sunC * (pow(s, 90.0) * 1.0 + pow(s, 8.0) * 0.16);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.layers.set(FX);
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(C.sheet, mix(C.mist, C.fold, 0.25), 1.8));
  const sun = new THREE.DirectionalLight(C.sheet, 2.4);
  sun.position.set(-18, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);

  const put = <T extends THREE.Object3D>(parent: THREE.Object3D, o: T, at?: [number, number, number], fx = false): T => {
    if (at) o.position.set(...at);
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = !fx;
        c.receiveShadow = !fx;
      }
      if (fx) c.layers.set(FX);
    });
    parent.add(o);
    return o;
  };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => new THREE.Mesh(g, m);
  const boxG = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  /** a gable roof along x: a triangular prism */
  const gableG = (w: number, h: number, d: number) => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0);
    s.lineTo(d / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return g;
  };

  // ---------- painted surfaces ----------
  type FacadeOpts = { wall: string; trim: string; rows: number; cols: number; door?: "center" | "left" | "wide"; doorColor?: string; sign?: { en: string; jp: string; bg: string; fg: string }; lit?: boolean };
  const facade = (o: FacadeOpts) =>
    canvasTex(1024, 640, (g, w, h) => {
      g.fillStyle = o.wall;
      g.fillRect(0, 0, w, h);
      // plinth and cornice
      g.fillStyle = o.trim;
      g.fillRect(0, h - 34, w, 34);
      g.fillRect(0, 0, w, 18);
      const signH = o.sign ? 120 : 0;
      if (o.sign) {
        g.fillStyle = o.sign.bg;
        g.fillRect(60, 36, w - 120, signH - 28);
        g.fillStyle = o.sign.fg;
        g.textBaseline = "middle";
        g.font = `800 60px ${F.display}`;
        g.textAlign = "left";
        g.fillText(o.sign.jp, 92, 36 + (signH - 28) / 2 + 2);
        g.font = `600 44px ${F.body}`;
        g.textAlign = "right";
        g.fillText(o.sign.en, w - 92, 36 + (signH - 28) / 2 + 2);
      }
      // windows on a grid, with frames, mullions and a glint
      const top = 40 + signH;
      const bottom = h - 60;
      const doorW = o.door === "wide" ? 300 : o.door ? 170 : 0;
      const doorX = o.door === "left" ? 120 : (w - doorW) / 2;
      const cellW = (w - 120) / o.cols;
      const cellH = (bottom - top) / o.rows;
      for (let r = 0; r < o.rows; r++)
        for (let c = 0; c < o.cols; c++) {
          const x = 60 + c * cellW + cellW * 0.18;
          const y = top + r * cellH + cellH * 0.14;
          const ww = cellW * 0.64;
          const wh = cellH * 0.66;
          if (o.door && r === o.rows - 1 && x + ww > doorX - 10 && x < doorX + doorW + 10) continue;
          g.fillStyle = o.trim;
          g.fillRect(x - 8, y - 8, ww + 16, wh + 16);
          g.fillStyle = o.lit ? hex.glint : hex.pool2;
          g.fillRect(x, y, ww, wh);
          g.fillStyle = hex.mist;
          g.globalAlpha = 0.55;
          g.beginPath();
          g.moveTo(x, y + wh * 0.55);
          g.lineTo(x + ww * 0.45, y);
          g.lineTo(x + ww * 0.7, y);
          g.lineTo(x, y + wh * 0.95);
          g.fill();
          g.globalAlpha = 1;
          g.fillStyle = o.trim;
          g.fillRect(x + ww / 2 - 4, y, 8, wh);
          g.fillRect(x, y + wh / 2 - 4, ww, 8);
          g.fillRect(x - 14, y + wh + 6, ww + 28, 12); // sill
        }
      if (o.door) {
        const dh = (bottom - top) * 0.55;
        const dy = h - 34 - dh;
        g.fillStyle = o.trim;
        g.fillRect(doorX - 12, dy - 12, doorW + 24, dh + 12);
        g.fillStyle = o.doorColor ?? hex.seal;
        g.fillRect(doorX, dy, doorW, dh);
        g.fillStyle = hex.mist;
        g.globalAlpha = 0.5;
        g.fillRect(doorX + 18, dy + 18, doorW / 2 - 26, dh * 0.42);
        g.fillRect(doorX + doorW / 2 + 8, dy + 18, doorW / 2 - 26, dh * 0.42);
        g.globalAlpha = 1;
        g.fillStyle = hex.sheet;
        g.beginPath();
        g.arc(doorX + doorW / 2 - 18, dy + dh * 0.62, 7, 0, Math.PI * 2);
        g.fill();
      }
    });
  const side = (wall: string, trim: string, cols: number) => facade({ wall, trim, rows: 1, cols });
  const roofTiles = (base: string, line: string) =>
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = line;
      g.lineWidth = 6;
      for (let y = 0; y < h; y += 42) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
        for (let x = (y / 42) % 2 ? 0 : 32; x < w; x += 64) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 42);
          g.stroke();
        }
      }
    });
  const paving = (base: string, line: string, step: number) => {
    const t = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = line;
      g.lineWidth = 3;
      for (let i = 0; i <= w; i += step) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(w, i);
        g.stroke();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };

  /** a building: a box with a painted front, painted sides, and a roof */
  const building = (o: { w: number; h: number; d: number; front: THREE.Texture; side: THREE.Texture; wall: string; roof: "gable" | "flat" | "saw"; roofColor: string; tiles?: THREE.Texture }) => {
    const g = new THREE.Group();
    const wallM = toon(o.wall);
    const frontM = toon(o.wall, o.front);
    const sideM = toon(o.wall, o.side);
    // BoxGeometry groups: +x, -x, +y, -y, +z, -z
    put(g, mesh(boxG(o.w, o.h, o.d), [sideM, sideM, wallM, wallM, frontM, sideM]), [0, o.h / 2, 0]);
    const roofM = o.tiles ? toon(o.roofColor, o.tiles) : toon(o.roofColor);
    if (o.roof === "gable") put(g, mesh(gableG(o.w + 0.5, o.h * 0.42, o.d + 0.6), roofM), [0, o.h, 0]);
    if (o.roof === "flat") {
      put(g, mesh(boxG(o.w + 0.3, 0.32, o.d + 0.3), toon(o.roofColor)), [0, o.h + 0.16, 0]);
      put(g, mesh(boxG(o.w - 0.6, 0.5, o.d - 0.6), toon(hex.mist)), [0, o.h + 0.5, 0]);
    }
    if (o.roof === "saw") {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const s = new THREE.Shape();
        const step = o.w / n;
        s.moveTo(0, 0);
        s.lineTo(step, 0);
        s.lineTo(step, 1.3);
        s.closePath();
        const geo = new THREE.ExtrudeGeometry(s, { depth: o.d + 0.4, bevelEnabled: false });
        geo.translate(-o.w / 2 + i * step, o.h, -(o.d + 0.4) / 2);
        put(g, mesh(geo, roofM));
        put(g, mesh(new THREE.PlaneGeometry(o.d + 0.2, 1.1), light(C.glint)), [-o.w / 2 + (i + 1) * step - 0.02, o.h + 0.62, 0], true).rotation.y = Math.PI / 2;
      }
    }
    return g;
  };

  // ---------- the island: a square plate with strata ----------
  const S = 13; // half size
  const strata = canvasTex(1024, 256, (g, w, h) => {
    const bands = [hex.mist, hex.pool2, hex.wave, hex.pool2, hex.pool];
    bands.forEach((b, i) => {
      g.fillStyle = b;
      g.fillRect(0, (i * h) / bands.length, w, h / bands.length + 1);
    });
    g.fillStyle = hex.glint;
    g.fillRect(0, h * 0.2 - 3, w, 6);
  });
  strata.wrapS = THREE.RepeatWrapping;
  strata.repeat.set(3, 1);
  put(world, mesh(boxG(2 * S, 3.2, 2 * S), [toon(hex.sheet, strata), toon(hex.sheet, strata), toon(hex.mist), toon(hex.pool), toon(hex.sheet, strata), toon(hex.sheet, strata)]), [0, -1.6, 0]);
  put(world, mesh(new THREE.ConeGeometry(S * 1.05, 7, 4, 1), toon(hex.pool)), [0, -6.7, 0]).rotation.y = Math.PI / 4;
  // lawns at the corners, sidewalks, the ring road, the plaza
  const lawn = toon(mix(C.mist, C.sheet, 0.35));
  const walkTex = paving(hex.paper, hex.mist, 64);
  walkTex.repeat.set(6, 6);
  const walk = toon(hex.paper, walkTex);
  const roadM = toon(mix(C.mist, C.head, 0.32));
  const plazaTex = paving(hex.sheet, hex.fiber, 85);
  plazaTex.repeat.set(3, 3);
  put(world, mesh(boxG(2 * S - 0.4, 0.12, 2 * S - 0.4), walk), [0, 0.06, 0]);
  const R0 = 5.2;
  const R1 = 7.6;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const size = S - R1 - 0.6;
    put(world, mesh(boxG(size, 0.16, size), lawn), [x * (R1 + 0.3 + size / 2), 0.09, z * (R1 + 0.3 + size / 2)]);
  }
  // road: four strips round the plaza, lane dashes, crossings
  const mid = (R0 + R1) / 2;
  const roadW = R1 - R0;
  for (const [x, z, w, d] of [[0, -mid, 2 * R1, roadW], [0, mid, 2 * R1, roadW], [-mid, 0, roadW, 2 * R0], [mid, 0, roadW, 2 * R0]] as const) {
    put(world, mesh(boxG(w, 0.14, d), roadM), [x, 0.07, z]);
  }
  const dashM = light(C.sheet);
  for (let i = -6; i <= 6; i++) {
    if (Math.abs(i) < 1) continue;
    for (const z of [-mid, mid]) put(world, mesh(new THREE.PlaneGeometry(0.7, 0.12), dashM), [i * 1.1, 0.145, z], true).rotation.x = -Math.PI / 2;
    for (const x of [-mid, mid]) if (Math.abs(i) < 5) put(world, mesh(new THREE.PlaneGeometry(0.12, 0.7), dashM), [x, 0.145, i * 1.1], true).rotation.x = -Math.PI / 2;
  }
  // zebra crossings at the four plaza entrances
  for (const [x, z, rot] of [[0, -mid, 0], [0, mid, 0], [-mid, 0, Math.PI / 2], [mid, 0, Math.PI / 2]] as const) {
    const zg = new THREE.Group();
    for (let i = -3; i <= 3; i++) put(zg, mesh(new THREE.PlaneGeometry(0.28, roadW * 0.8), dashM), [i * 0.5, 0, 0], true).rotation.x = -Math.PI / 2;
    zg.position.set(x, 0.15, z);
    zg.rotation.y = rot;
    world.add(zg);
  }
  put(world, mesh(boxG(2 * R0 - 0.6, 0.2, 2 * R0 - 0.6), toon(hex.sheet, plazaTex)), [0, 0.1, 0]);

  // ---------- details: trees, lamps, benches, planters, fences ----------
  const leaf = toon(mix(C.pool2, C.mist, 0.42));
  const leaf2 = toon(mix(C.pool2, C.mist, 0.58));
  const bark = toon(hex.ink);
  const tree = (x: number, z: number, s = 1) => {
    const g = new THREE.Group();
    put(g, mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), bark), [0, 0.6, 0]);
    put(g, mesh(new THREE.IcosahedronGeometry(0.9, 1), leaf), [0, 1.7, 0]);
    put(g, mesh(new THREE.IcosahedronGeometry(0.62, 1), leaf2), [0.5, 1.45, 0.25]);
    put(g, mesh(new THREE.IcosahedronGeometry(0.55, 1), leaf2), [-0.42, 1.5, -0.2]);
    g.scale.setScalar(s);
    put(world, g, [x, 0.16, z]);
  };
  const lampHead = light(C.sheet);
  const lamp = (x: number, z: number) => {
    const g = new THREE.Group();
    put(g, mesh(new THREE.CylinderGeometry(0.05, 0.07, 2, 8), toon(hex.head)), [0, 1, 0]);
    put(g, mesh(boxG(0.5, 0.06, 0.06), toon(hex.head)), [0.2, 2, 0]);
    put(g, mesh(new THREE.SphereGeometry(0.13, 12, 8), lampHead), [0.42, 1.9, 0], true);
    put(world, g, [x, 0.2, z]);
  };
  const bench = (x: number, z: number, r: number) => {
    const g = new THREE.Group();
    put(g, mesh(boxG(1.2, 0.08, 0.36), toon(hex.seal)), [0, 0.42, 0]);
    put(g, mesh(boxG(1.2, 0.3, 0.06), toon(hex.seal)), [0, 0.62, -0.16]);
    for (const dx of [-0.5, 0.5]) put(g, mesh(boxG(0.06, 0.42, 0.3), toon(hex.head)), [dx, 0.21, 0]);
    g.rotation.y = r;
    put(world, g, [x, 0.2, z]);
  };
  const planter = (x: number, z: number) => {
    const g = new THREE.Group();
    put(g, mesh(boxG(1.1, 0.4, 0.5), toon(hex.paper)), [0, 0.2, 0]);
    for (let i = 0; i < 4; i++) put(g, mesh(new THREE.IcosahedronGeometry(0.17, 0), toon(i % 2 ? hex.fold : hex.fiber)), [-0.36 + i * 0.24, 0.5, 0]);
    put(world, g, [x, 0.2, z]);
  };
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.6);
    for (let i = 0; i <= n; i++) put(world, mesh(boxG(0.08, 0.4, 0.08), toon(hex.sheet)), [x0 + ((x1 - x0) * i) / n, 0.37, z0 + ((z1 - z0) * i) / n]);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rail = put(world, mesh(boxG(len, 0.05, 0.05), toon(hex.sheet)), [(x0 + x1) / 2, 0.48, (z0 + z1) / 2]);
    rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  };
  for (const [x, z, s] of [[-11.6, -5.4, 0.9], [11.6, -5.2, 0.85], [-11.4, 5.4, 0.9], [11.6, 5.6, 0.9], [-5.6, -11.6, 0.8], [5.6, -11.6, 0.8], [-3.6, 4.2, 0.7], [3.8, 4.0, 0.7], [-4.2, -4.0, 0.7]] as const) tree(x, z, s);
  for (const [x, z] of [[-R0 + 0.6, -R0 + 0.6], [R0 - 0.6, -R0 + 0.6], [-R0 + 0.6, R0 - 0.6], [R0 - 0.6, R0 - 0.6]] as const) lamp(x, z);
  bench(3.2, 1.2, -Math.PI / 2);
  bench(-3.4, 1.0, Math.PI / 2);
  planter(2.4, -4.3);
  planter(-2.4, 4.4);
  fence(-12.2, -7.9, -8.2, -7.9);
  fence(8.2, 7.9, 12.2, 7.9);

  // ---------- the supplier's workshop ----------
  const W = (o: Parameters<typeof building>[0], p: keyof typeof PLACES) => {
    const b = building(o);
    b.rotation.y = PLACES[p].face;
    put(world, b, [PLACES[p].at.x, 0.17, PLACES[p].at.z]);
    return b;
  };
  const workshop = W(
    {
      w: 6, h: 3.4, d: 4.2, wall: hex.sheet, roof: "saw", roofColor: hex.head,
      front: facade({ wall: hex.sheet, trim: hex.head, rows: 2, cols: 5, door: "wide", doorColor: hex.ink2, sign: { en: "SUPPLIER WORKS", jp: "工房", bg: hex.head, fg: hex.sheet }, lit: true }),
      side: side(hex.sheet, hex.head, 4),
    },
    "supplier",
  );
  put(workshop, mesh(new THREE.CylinderGeometry(0.3, 0.38, 2.6, 14), toon(hex.seal)), [2.2, 4.6, -1.2]);
  put(workshop, mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 14), toon(hex.head)), [2.2, 5.9, -1.2]);
  for (const [x, z, s] of [[-3.6, 1.6, 0.7], [-3.6, 0.8, 0.7], [-2.9, 1.6, 0.6], [-3.25, 1.2, 0.5]] as const) {
    const crate = put(workshop, mesh(boxG(s, s, s), toon(mix(C.fold, C.sheet, 0.45))), [x, s / 2 + (x === -3.25 ? 0.7 : 0), z]);
    crate.rotation.y = 0.2;
  }
  const steam: THREE.Mesh[] = [];
  const steamM = toon(hex.sheet);
  for (let i = 0; i < 5; i++) steam.push(put(workshop, mesh(new THREE.IcosahedronGeometry(0.45, 1), steamM), [2.2, 6.2, -1.2], true));

  // ---------- the buyer's shop ----------
  const tiles = roofTiles(hex.head, hex.pool2);
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(2, 2);
  const shop = W(
    {
      w: 5.4, h: 3.2, d: 4, wall: hex.sheet, roof: "gable", roofColor: hex.sheet, tiles,
      front: facade({ wall: hex.sheet, trim: hex.seal, rows: 2, cols: 4, door: "center", sign: { en: "BUYER MART", jp: "商店", bg: hex.seal, fg: hex.sheet }, lit: true }),
      side: side(hex.sheet, hex.seal, 3),
    },
    "buyer",
  );
  for (let i = 0; i < 9; i++) {
    const a = put(shop, mesh(boxG(0.6, 0.06, 1.3), toon(i % 2 ? hex.sheet : hex.seal)), [-2.4 + i * 0.6, 2.3, 2.55]);
    a.rotation.x = 0.42;
  }

  // ---------- the Registry tower and its public board ----------
  const towerG = new THREE.Group();
  put(world, towerG, [PLACES.tower.at.x, 0.2, PLACES.tower.at.z]);
  put(towerG, mesh(boxG(4.2, 0.5, 4.2), toon(hex.paper)), [0, 0.25, 0]);
  const towerSide = toon(hex.sheet, facade({ wall: hex.sheet, trim: hex.head, rows: 4, cols: 2, lit: true }));
  const towerFront = toon(hex.sheet, facade({ wall: hex.sheet, trim: hex.head, rows: 5, cols: 2, door: "center", doorColor: hex.head }));
  put(towerG, mesh(boxG(3.6, 9, 3.2), [towerSide, towerSide, toon(hex.sheet), toon(hex.sheet), towerFront, towerSide]), [0, 5, 0]);
  put(towerG, mesh(boxG(4, 0.4, 3.6), toon(hex.head)), [0, 9.7, 0]);
  const spire = new THREE.ConeGeometry(2.4, 2.6, 4);
  spire.rotateY(Math.PI / 4);
  put(towerG, mesh(spire, toon(hex.head)), [0, 11.2, 0]);
  const beacon = put(towerG, mesh(new THREE.SphereGeometry(0.28, 16, 10), light(C.glint)), [0, 12.7, 0], true);
  const signTex = canvasTex(1024, 220, (g, w, h) => {
    g.fillStyle = hex.head;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex.sheet;
    g.textBaseline = "middle";
    g.font = `800 92px ${F.display}`;
    g.textAlign = "left";
    g.fillText("登記所", 50, h / 2 + 4);
    g.font = `600 60px ${F.body}`;
    g.textAlign = "right";
    g.fillText("REGISTRY", w - 50, h / 2 + 4);
  });
  put(towerG, mesh(new THREE.PlaneGeometry(3.4, 0.73), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false })), [0, 8.9, 1.61], true);

  let boardState: BoardState = "off";
  const short = (n: string) => `${n.slice(0, 8)}…${n.slice(-6)}`;
  const paintBoard: Paint = (g, w, h) => {
    g.fillStyle = hex.pool;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = hex.glint;
    g.lineWidth = 6;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = hex.sheet;
    g.textBaseline = "middle";
    g.font = `700 64px ${F.display}`;
    g.textAlign = "left";
    g.fillText("Public board", 56, 92);
    g.font = `800 64px ${F.display}`;
    g.textAlign = "right";
    g.fillText("登記簿", w - 56, 92);
    g.fillStyle = hex.mist;
    g.font = `500 32px ${F.body}`;
    g.textAlign = "left";
    g.fillText("One fingerprint N per invoice", 56, 156);
    g.fillRect(56, 186, w - 112, 3);
    const rowH = 92;
    const rows = [...BOARD_ROWS.map((n) => ({ n, st: "lit" as BoardState, ours: false })), { n: opts.n, st: boardState, ours: true }];
    rows.forEach((r, i) => {
      const y = 214 + i * rowH;
      if (r.ours && r.st === "off") {
        g.strokeStyle = hex.mist;
        g.setLineDash([14, 12]);
        g.lineWidth = 3;
        g.strokeRect(56, y + 8, w - 112, rowH - 20);
        g.setLineDash([]);
        return;
      }
      const bg = r.ours ? (r.st === "caught" ? hex.seal : r.st === "settled" ? hex.sheet : hex.glint) : hex.pool2;
      g.fillStyle = bg;
      g.fillRect(56, y + 8, w - 112, rowH - 20);
      g.fillStyle = r.ours && r.st === "settled" ? hex.head : hex.sheet;
      g.font = `500 40px ${F.mono}`;
      g.textAlign = "left";
      g.fillText(short(r.n), 80, y + rowH / 2 - 2);
      g.font = `600 30px ${F.body}`;
      g.textAlign = "right";
      const label = !r.ours ? "registered" : r.st === "caught" ? "seen again · refused" : r.st === "settled" ? "settled ✓" : "registered · new";
      g.fillText(label, w - 80, y + rowH / 2 - 2);
    });
  };
  const boardTex = canvasTex(1024, 900, paintBoard);
  put(towerG, mesh(new THREE.PlaneGeometry(3.2, 2.8), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })), [0, 5.1, 1.66], true); // in front of its frame (1.62), never z-fighting
  put(towerG, mesh(boxG(3.5, 3.1, 0.12), toon(hex.head)), [0, 5.1, 1.56]);
  // the same board on the north face, for the banks across the square
  const backBoard = put(towerG, mesh(new THREE.PlaneGeometry(3.2, 2.8), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })), [0, 5.1, -1.66], true);
  backBoard.rotation.y = Math.PI;
  put(towerG, mesh(boxG(3.5, 3.1, 0.12), toon(hex.head)), [0, 5.1, -1.56]);
  // where our row sits on the board (island coordinates), for N and the beams
  const ourRowLocal = new THREE.Vector3(0, 5.1 + 1.4 - ((214 + 6 * 92 + 46) / 900) * 2.8, 1.72);
  const ourRow = ourRowLocal.clone().add(towerG.position);
  const ourRowBack = new THREE.Vector3(-ourRowLocal.x, ourRowLocal.y, -ourRowLocal.z).add(towerG.position);

  // ---------- the shielded vault ----------
  const vaultG = new THREE.Group();
  put(world, vaultG, [PLACES.vault.at.x, 0.2, PLACES.vault.at.z]);
  put(vaultG, mesh(boxG(3, 2.2, 1.8), [toon(hex.pool2), toon(hex.pool2), toon(hex.head), toon(hex.head), toon(hex.pool2), toon(hex.pool2)]), [0, 1.1, 0]);
  put(vaultG, mesh(boxG(3.3, 0.24, 2.1), toon(hex.head)), [0, 2.32, 0]);
  const vSign = canvasTex(1024, 200, (g, w, h) => {
    g.fillStyle = hex.head;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex.glint;
    g.textBaseline = "middle";
    g.font = `800 84px ${F.display}`;
    g.textAlign = "left";
    g.fillText("金庫", 44, h / 2 + 4);
    g.fillStyle = hex.sheet;
    g.font = `600 52px ${F.body}`;
    g.textAlign = "right";
    g.fillText("SHIELDED VAULT", w - 44, h / 2 + 4);
  });
  put(vaultG, mesh(new THREE.PlaneGeometry(2.9, 0.56), new THREE.MeshBasicMaterial({ map: vSign, toneMapped: false })), [0, 2.0, 0.91], true);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.7, 0.9, 0.92);
  vaultG.add(doorPivot);
  const doorM = put(doorPivot, mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.18, 32), toon(hex.mist)), [0.7, 0, 0.09]);
  doorM.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) put(doorM, mesh(boxG(0.9, 0.1, 0.08), toon(hex.head)), [0, 0.12, 0]).rotation.y = (i * Math.PI) / 3;
  put(doorM, mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 32), toon(hex.head)), [0, 0.1, 0]).rotation.x = Math.PI / 2;
  const vaultGlow = put(vaultG, mesh(new THREE.CircleGeometry(0.66, 32), light(C.glint)), [0, 0.9, 0.905], true);

  // ---------- the banks ----------
  const bank = (p: "bankA" | "bankB", jp: string, en: string, mark: string) => {
    const b = W(
      {
        w: 5.4, h: 3.6, d: 4, wall: hex.sheet, roof: "flat", roofColor: hex.head,
        front: facade({ wall: hex.sheet, trim: hex.head, rows: 2, cols: 4, door: "center", doorColor: hex.head, sign: { en, jp, bg: mark, fg: hex.sheet } }),
        side: side(hex.sheet, hex.head, 3),
      },
      p,
    );
    // portico: steps and columns in front
    put(b, mesh(boxG(4.2, 0.18, 1.2), toon(hex.paper)), [0, 0.09, 2.6]);
    for (let i = 0; i < 4; i++) put(b, mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.6, 12), toon(hex.sheet)), [-1.5 + i, 1.4, 2.6]);
    put(b, mesh(boxG(4.4, 0.3, 1.4), toon(hex.head)), [0, 2.85, 2.6]);
    put(b, mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), toon(hex.head)), [1.8, 4.6, -1]);
    put(b, mesh(new THREE.SphereGeometry(0.14, 10, 8), light(C.glint)), [1.8, 5.35, -1], true);
    return b;
  };
  const bankA = bank("bankA", "銀行", "FINANCIER A", hex.pool2);
  const bankB = bank("bankB", "銀行", "FINANCIER B", hex.ink2);
  // bank B's roll-down shutter, and the refusal stamp on it
  const shutterTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex.mist;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex.pool2;
    for (let y = 0; y < h; y += 22) g.fillRect(0, y, w, 6);
  });
  const shutter = put(bankB, mesh(new THREE.PlaneGeometry(1.4, 1.9), new THREE.MeshToonMaterial({ map: shutterTex, gradientMap: ramp })), [0, 1.13, 2.03]);
  const shutterTop = 2.08;
  // big hanko-style stamps that pop above the town, facing the camera, so each verdict reads at
  // town scale: registered (the board), refused (bank B), settled (bank A)
  const stampTex = (jp: string, en: string, ink: string) =>
    canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = hex.sheet;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = ink;
      g.lineWidth = 14;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = ink;
      g.textBaseline = "middle";
      g.textAlign = "center";
      g.font = `800 92px ${F.display}`;
      g.fillText(jp, w / 2, h / 2 - 34);
      g.font = `700 52px ${F.body}`;
      g.fillText(en, w / 2, h / 2 + 52);
    });
  const mkStamp = (tex: THREE.Texture, at: [number, number, number]) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, depthTest: false });
    const plate = put(world, mesh(new THREE.PlaneGeometry(4.6, 2.3), m), at, true);
    plate.renderOrder = 10;
    plate.visible = false;
    return { plate, m };
  };
  const stamps = {
    registered: mkStamp(stampTex("登録", "REGISTERED", hex.wave), [PLACES.tower.at.x, 14.6, PLACES.tower.at.z]),
    refused: mkStamp(stampTex("拒否", "REFUSED", hex.seal), [PLACES.bankB.at.x, 7.4, PLACES.bankB.at.z]),
    settled: mkStamp(stampTex("済", "SETTLED", hex.head), [PLACES.bankA.at.x, 7.4, PLACES.bankA.at.z]),
  };

  // beams from the banks' masts to our row on the board
  const beamGeom = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
  beamGeom.translate(0, 0.5, 0);
  const mast = (b: THREE.Object3D) => b.localToWorld(new THREE.Vector3(1.8, 5.35, -1)).sub(world.position);
  world.updateMatrixWorld(true);
  const mkBeam = (b: THREE.Object3D) => {
    const a = mast(b);
    const m = put(world, mesh(beamGeom, light(C.glint, 0.9)), [a.x, a.y, a.z], true);
    // the banks stand south of the square, so they read the board's north face
    m.userData.len = a.distanceTo(ourRowBack);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ourRowBack.clone().sub(a).normalize());
    m.visible = false;
    return m;
  };
  const beamA = mkBeam(bankA);
  const beamB = mkBeam(bankB);

  // ---------- figures ----------
  const skin = toon(mix(C.fiber, C.sheet, 0.55));
  const figure = (body: string, hair: string, at: [number, number, number], face: number) => {
    const g = new THREE.Group();
    put(g, mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 12), toon(body)), [0, 0.6, 0]);
    const headG = new THREE.Group();
    headG.position.y = 1.32;
    g.add(headG);
    put(headG, mesh(new THREE.SphereGeometry(0.26, 16, 12), skin));
    put(headG, mesh(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(hair)), [0, 0.03, -0.02]);
    const arm = new THREE.Group();
    arm.position.set(0.3, 0.95, 0);
    g.add(arm);
    put(arm, mesh(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8), toon(body)), [0, -0.24, 0]);
    g.rotation.y = face;
    put(world, g, at);
    return { g, headG, arm };
  };
  const people = {
    supplier: figure(hex.ink2, hex.head, [-7.6, 0.2, -6.4], 0.3),
    buyer: figure(hex.seal, hex.head, [7.6, 0.2, -6.0], -0.3),
    bankA: figure(hex.pool2, hex.ink, [-9.2, 0.38, 6.4], Math.PI),
    bankB: figure(hex.ink, hex.head, [8.4, 0.38, 6.4], Math.PI),
    clerk: figure(hex.head, hex.ink, [2.2, 0.4, 0.4], -0.6),
  };

  // ---------- the truck ----------
  const truck = new THREE.Group();
  const truckSide = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = hex.sheet;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex.seal;
    g.fillRect(0, h - 40, w, 40);
    g.fillStyle = hex.head;
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.font = `800 84px ${F.display}`;
    g.fillText("工房", w / 2, h / 2 - 22);
  });
  const cargoSide = toon(hex.sheet, truckSide);
  // the body rides on its own pivot (over the rear axle) so it can pitch on the throttle and brake
  const truckBody = new THREE.Group();
  truckBody.position.set(-0.8, 0.24, 0);
  truck.add(truckBody);
  put(truckBody, mesh(boxG(1.8, 1.1, 1.0), [toon(hex.sheet), toon(hex.sheet), toon(hex.sheet), toon(hex.sheet), cargoSide, cargoSide]), [0.5, 0.61, 0]);
  put(truckBody, mesh(boxG(0.8, 0.85, 0.96), toon(hex.seal)), [1.8, 0.48, 0]);
  put(truckBody, mesh(new THREE.PlaneGeometry(0.5, 0.36), light(C.glint)), [2.21, 0.64, 0], true).rotation.y = Math.PI / 2;
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.8, 0.5], [-0.8, -0.5], [0.95, 0.5], [0.95, -0.5]] as const) {
    const wheel = put(truck, mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 16), toon(hex.head)), [x, 0.22, z]);
    wheel.rotation.x = Math.PI / 2;
    // a hub bar on each side, so the spin reads
    put(wheel, mesh(boxG(0.3, 0.17, 0.06), toon(hex.mist)));
    wheels.push(wheel);
  }
  truck.scale.setScalar(0.85);
  put(world, truck);
  // one loop round the ring road, in the outer lane, with rounded corners: out to the shop
  // along the north road, then home by the east, south and west roads
  const lane = 6.9;
  const bend = 1.5;
  const truckPath = new THREE.CurvePath<THREE.Vector3>();
  const P = (x: number, z: number) => new THREE.Vector3(x, 0.16, z);
  const start = P(-4.6, -lane);
  const stopX = 5.0;
  truckPath.add(new THREE.LineCurve3(start, P(lane - bend, -lane)));
  truckPath.add(new THREE.QuadraticBezierCurve3(P(lane - bend, -lane), P(lane, -lane), P(lane, -lane + bend)));
  truckPath.add(new THREE.LineCurve3(P(lane, -lane + bend), P(lane, lane - bend)));
  truckPath.add(new THREE.QuadraticBezierCurve3(P(lane, lane - bend), P(lane, lane), P(lane - bend, lane)));
  truckPath.add(new THREE.LineCurve3(P(lane - bend, lane), P(-lane + bend, lane)));
  truckPath.add(new THREE.QuadraticBezierCurve3(P(-lane + bend, lane), P(-lane, lane), P(-lane, lane - bend)));
  truckPath.add(new THREE.LineCurve3(P(-lane, lane - bend), P(-lane, -lane + bend)));
  truckPath.add(new THREE.QuadraticBezierCurve3(P(-lane, -lane + bend), P(-lane, -lane), P(-lane + bend, -lane)));
  truckPath.add(new THREE.LineCurve3(P(-lane + bend, -lane), start));
  const truckLen = truckPath.getLength();
  /** where the shop's stop is on the loop (0..1) */
  const shopStop = (stopX - start.x) / truckLen;
  const drive = { dist: 0, v: 0, at: 0, pitch: 0 };

  // ---------- the invoice: paper planes, the sheet, the jitsuin ----------
  const planeGeom = new THREE.BufferGeometry();
  planeGeom.setAttribute("position", new THREE.Float32BufferAttribute([0.9, 0, 0, -0.5, 0, 0.55, -0.35, -0.05, 0, 0.9, 0, 0, -0.35, -0.05, 0, -0.5, 0, -0.55, 0.9, 0, 0, -0.35, -0.05, 0, -0.45, -0.28, 0], 3));
  planeGeom.computeVertexNormals();
  const paperM = new THREE.MeshToonMaterial({ color: C.sheet, gradientMap: ramp, side: THREE.DoubleSide });
  const mkPlane = (sealed: boolean) => {
    const g = new THREE.Group();
    put(g, mesh(planeGeom, paperM));
    if (sealed) put(g, mesh(new THREE.CircleGeometry(0.12, 20), light(C.seal)), [-0.1, 0.006, 0.24], true).rotation.x = -Math.PI / 2;
    g.scale.setScalar(1.5);
    g.visible = false;
    put(world, g);
    return g;
  };
  const planeShop = mkPlane(false);
  const planeVault = mkPlane(true);
  const planeCopy = mkPlane(true);
  // speed lines behind a flying plane
  const trailN = 24;
  const mkTrail = () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(trailN * 3), 3));
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: C.sheet, transparent: true, opacity: 0.9, toneMapped: false }));
    l.frustumCulled = false;
    l.visible = false;
    put(world, l, undefined, true);
    return l;
  };
  const trails = new Map<THREE.Object3D, THREE.Line>([[planeShop, mkTrail()], [planeVault, mkTrail()], [planeCopy, mkTrail()]]);
  const sheetAt = new THREE.Vector3(8.4, 0.3, -3.9); // on the plaza corner in front of the shop
  const routes = {
    shop: new THREE.CatmullRomCurve3([new THREE.Vector3(-8.2, 3.2, -7), new THREE.Vector3(-3, 6.4, -9), new THREE.Vector3(4, 5.2, -7.6), sheetAt.clone().setY(0.7)]),
    vault: new THREE.CatmullRomCurve3([sheetAt.clone().setY(0.7), new THREE.Vector3(6, 3.6, -1), new THREE.Vector3(2.4, 2.6, 4.8), PLACES.vault.at.clone().add(new THREE.Vector3(-0.2, 1.1, 1.2))]),
    copy: new THREE.CatmullRomCurve3([new THREE.Vector3(-8.2, 3.2, -7), new THREE.Vector3(-4.4, 7, 2), new THREE.Vector3(4, 5.4, 6.4), PLACES.bankB.at.clone().add(new THREE.Vector3(0, 1.6, -3))]),
  };
  const fly = (g: THREE.Object3D, curve: THREE.CatmullRomCurve3, t: number, roll = 0) => {
    const k = Math.min(1, Math.max(0, t));
    const p = curve.getPointAt(k);
    g.position.copy(p);
    g.lookAt(world.localToWorld(curve.getPointAt(Math.min(1, k + 0.01))));
    g.rotateY(-Math.PI / 2);
    g.rotateX(Math.sin(k * Math.PI * 2) * 0.3 + roll);
    const tr = trails.get(g)!;
    tr.visible = g.visible && k > 0.02 && k < 0.98;
    const a = tr.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < trailN; i++) {
      const q = curve.getPointAt(Math.max(0, k - (i / trailN) * 0.12));
      a.setXYZ(i, q.x, q.y - 0.05, q.z);
    }
    a.needsUpdate = true;
  };

  const sheetG = new THREE.Group();
  const BIG = 1.7; // the invoice and the seal read at town distance
  sheetG.scale.setScalar(BIG);
  put(world, sheetG, [sheetAt.x, sheetAt.y, sheetAt.z]);
  const sheetFace = canvasTex(512, 680, (g, w, h) => {
    g.fillStyle = hex.sheet;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex.head;
    g.textBaseline = "middle";
    g.font = `700 64px ${F.display}`;
    g.fillText("Invoice", 40, 70);
    g.font = `500 28px ${F.mono}`;
    g.fillStyle = hex.ink2;
    g.fillText("TES-INV-0007", 290, 72);
    g.fillStyle = hex.fiber;
    g.fillRect(40, 118, w - 80, 4);
    g.font = `500 30px ${F.body}`;
    const rows: [string, string][] = [["Amount", "0.0004 ZEC"], ["Due", "18 Dec 2026"], ["Terms", "60 days"]];
    rows.forEach(([k, v], i) => {
      g.fillStyle = hex.ink2;
      g.textAlign = "left";
      g.fillText(k, 40, 170 + i * 56);
      g.fillStyle = hex.ink;
      g.textAlign = "right";
      g.fillText(v, w - 40, 170 + i * 56);
    });
    g.textAlign = "left";
    g.fillStyle = hex.fiber;
    g.fillRect(40, 340, w - 80, 4);
    g.fillStyle = hex.ink2;
    g.fillText("Buyer's seal", 40, 620);
  });
  put(sheetG, mesh(boxG(1.5, 0.04, 2.0), [paperM, paperM, toon(hex.sheet, sheetFace), paperM, paperM, paperM]));
  const impression = put(sheetG, mesh(new THREE.RingGeometry(0.24, 0.33, 40), light(C.seal)), [0.35, 0.03, 0.5], true);
  impression.rotation.x = -Math.PI / 2;
  const impressionDot = put(sheetG, mesh(new THREE.CircleGeometry(0.19, 32), light(C.seal, 0.85)), [0.35, 0.031, 0.5], true);
  impressionDot.rotation.x = -Math.PI / 2;

  const jitsuin = new THREE.Group();
  const jBase = sheetAt.clone().add(new THREE.Vector3(0.35 * BIG, 0.04 * BIG, 0.5 * BIG));
  jitsuin.scale.setScalar(BIG);
  put(world, jitsuin, [jBase.x, jBase.y, jBase.z]);
  const jBody = new THREE.Group();
  jitsuin.add(jBody);
  put(jBody, mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 32), toon(hex.seal)), [0, 0.55, 0]);
  put(jBody, mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 32), toon(hex.sheet)), [0, 0.86, 0]);
  put(jBody, mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.8, 24), toon(hex.sealHi)), [0, 1.5, 0]);
  put(jBody, mesh(new THREE.SphereGeometry(0.32, 24, 16), toon(hex.seal)), [0, 2.05, 0]);
  const jShadow = put(world, mesh(new THREE.CircleGeometry(0.5 * BIG, 32), light(C.head, 0.0)), [jBase.x, jBase.y + 0.03, jBase.z], true);
  jShadow.rotation.x = -Math.PI / 2;

  // impact lines (anime): thin wedges round the press
  const burstG = new THREE.Group();
  burstG.scale.setScalar(BIG);
  put(world, burstG, [jBase.x, jBase.y + 0.08, jBase.z], true);
  const burstM = light(C.head, 0.9);
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.03);
    s.lineTo(1, 0);
    s.lineTo(0, 0.03);
    const m = mesh(new THREE.ShapeGeometry(s), burstM);
    m.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.rotation.y = (i / 18) * Math.PI * 2 + (i % 2) * 0.1;
    holder.add(m);
    m.layers.set(FX);
    burstG.add(holder);
  }
  burstG.visible = false;

  // the fingerprint N, a plate of light
  const nTex = canvasTex(1024, 220, (g, w, h) => {
    g.fillStyle = hex.glint;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex.sheet;
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.font = `500 96px ${F.mono}`;
    g.fillText(short(opts.n), w / 2, h / 2 + 4);
  });
  const nG = put(world, mesh(new THREE.PlaneGeometry(3, 0.64), new THREE.MeshBasicMaterial({ map: nTex, toneMapped: false })), undefined, true);
  nG.visible = false;
  const nRoute = new THREE.CatmullRomCurve3([sheetAt.clone().setY(1.2), new THREE.Vector3(7, 6, -3), new THREE.Vector3(3, ourRow.y + 1.4, ourRow.z + 1.2), ourRow.clone().add(new THREE.Vector3(0, 0, 0.12))]);

  // money as light
  const mkStream = (curve: THREE.CatmullRomCurve3, color: THREE.Color) => {
    const n = 30;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const pts = put(world, new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.36, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false })), undefined, true);
    pts.frustumCulled = false;
    pts.visible = false;
    return { pts, curve, n };
  };
  world.updateMatrixWorld(true);
  const advance = mkStream(new THREE.CatmullRomCurve3([mast(bankA), new THREE.Vector3(-12, 6, 0), new THREE.Vector3(-9.2, 5.2, -7.4)]), C.glint);
  const pay = mkStream(new THREE.CatmullRomCurve3([new THREE.Vector3(9.2, 4, -7.6), new THREE.Vector3(4, 7, 0), new THREE.Vector3(-4, 6.4, 6), mast(bankA)]), C.seal);

  // the calendar: a signboard by the workshop
  let calDays = 60;
  const paintCal: Paint = (g, w, h) => {
    g.fillStyle = hex.sheet;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex.seal;
    g.fillRect(0, 0, w, 70);
    g.fillStyle = hex.sheet;
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.font = `700 40px ${F.body}`;
    g.fillText("DUE IN", w / 2, 37);
    g.fillStyle = calDays > 0 ? hex.head : hex.seal;
    g.font = `800 150px ${F.display}`;
    g.fillText(calDays > 0 ? String(calDays) : "今日", w / 2, h / 2 + 30);
    g.fillStyle = hex.ink2;
    g.font = `600 36px ${F.body}`;
    g.fillText(calDays > 0 ? "days" : "due today", w / 2, h - 38);
  };
  const calTex = canvasTex(400, 380, paintCal);
  const calG = new THREE.Group();
  put(world, calG, [-5.6, 0.2, -11.2]);
  put(calG, mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), toon(hex.head)), [-0.8, 1.3, 0]);
  put(calG, mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), toon(hex.head)), [0.8, 1.3, 0]);
  put(calG, mesh(boxG(2, 1.9, 0.08), [toon(hex.head), toon(hex.head), toon(hex.head), toon(hex.head), toon(hex.sheet, calTex), toon(hex.head)]), [0, 2.2, 0]);

  // ---------- around the town: the cloud sea and far islands ----------
  const cloudM = toon(hex.sheet);
  const floor = new THREE.Group();
  floor.position.y = -24;
  scene.add(floor);
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 80; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 34 + rnd() * 90; // clear of the camera's foreground
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + rnd() * 7, 2), cloudM);
    m.position.set(Math.cos(a) * r, rnd() * 3, Math.sin(a) * r);
    m.scale.y = 0.42;
    floor.add(m);
  }
  const skyClouds: THREE.Group[] = [];
  for (const [x, y, z, s] of [[-40, 14, -60, 3], [30, 20, -70, 4], [60, 10, -30, 2.4], [-70, 8, 0, 2.6], [10, 26, -90, 5]] as const) {
    const c = new THREE.Group();
    c.position.set(x, y, z);
    c.scale.setScalar(s);
    for (const [dx, dy, r] of [[0, 0, 1.3], [1.4, -0.25, 1], [-1.3, -0.3, 0.95], [0.5, 0.7, 0.85], [-0.5, 0.55, 0.75]] as const) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), cloudM);
      m.position.set(dx, dy, 0);
      c.add(m);
    }
    scene.add(c);
    skyClouds.push(c);
  }
  const farIsland = (x: number, y: number, z: number, s: number) => {
    const g = new THREE.Group();
    put(g, mesh(boxG(6, 1.4, 6), [toon(hex.sheet, strata), toon(hex.sheet, strata), toon(hex.mist), toon(hex.pool), toon(hex.sheet, strata), toon(hex.sheet, strata)]), [0, -0.7, 0]);
    const cone = new THREE.ConeGeometry(4.2, 4, 4);
    cone.rotateY(Math.PI / 4);
    put(g, mesh(cone, toon(hex.pool)), [0, -3.4, 0]);
    put(g, mesh(boxG(1.8, 1.6, 1.6), toon(hex.sheet)), [0.8, 0.8, 0.6]);
    put(g, mesh(gableG(2.1, 0.8, 1.9), toon(hex.head)), [0.8, 1.6, 0.6]);
    put(g, mesh(new THREE.IcosahedronGeometry(0.9, 1), leaf), [-1.4, 1, -1]);
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    scene.add(g);
  };
  farIsland(-44, 2, -46, 1.1);
  farIsland(40, -4, -58, 1.5);
  farIsland(-62, -6, 12, 1);

  // ---------- rendering: colour, then ink lines from normals and depth ----------
  const camera = new THREE.PerspectiveCamera(24, 1, 1, 600);
  camera.layers.enable(FX);
  const normalTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  normalTarget.depthTexture = new THREE.DepthTexture(1, 1);
  const normalMat = new THREE.MeshNormalMaterial();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const inkPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tNormal: { value: null },
      tDepth: { value: null },
      texel: { value: new THREE.Vector2(1, 1) },
      ink: { value: C.head.clone() },
      near: { value: camera.near },
      far: { value: camera.far },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `#include <packing>
      uniform sampler2D tDiffuse, tNormal, tDepth; uniform vec2 texel; uniform vec3 ink; uniform float near, far;
      varying vec2 vUv;
      float depthAt(vec2 uv){ float z = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(z, near, far); }
      vec3 normalAt(vec2 uv){ return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float d = depthAt(vUv);
        vec3 n = normalAt(vUv);
        float dn = 0.0, dd = 0.0;
        vec2 o[4];
        o[0] = vec2(texel.x, 0.0); o[1] = vec2(-texel.x, 0.0); o[2] = vec2(0.0, texel.y); o[3] = vec2(0.0, -texel.y);
        for (int i = 0; i < 4; i++) {
          vec2 uv = vUv + o[i];
          dn += 1.0 - max(dot(n, normalAt(uv)), 0.0);
          dd += abs(depthAt(uv) - d);
        }
        float edge = smoothstep(0.35, 0.9, dn) + smoothstep(0.012, 0.03, dd / max(d, 1.0));
        float has = step(d, far * 0.98); // no lines on the sky
        float fade = 1.0 - smoothstep(80.0, 160.0, d); // far islands draw softer
        c.rgb = mix(c.rgb, ink, clamp(edge, 0.0, 1.0) * 0.88 * has * fade);
        gl_FragColor = c;
      }`,
  });
  // ShaderPass clones its uniforms, and render-target textures cannot be cloned: bind them after
  inkPass.uniforms.tNormal.value = normalTarget.texture;
  inkPass.uniforms.tDepth.value = normalTarget.depthTexture;
  composer.addPass(inkPass);
  composer.addPass(new OutputPass());

  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let baseRot = 0;
  let shakeK = 0;
  let w = 1, h = 1, quality = 1;
  const resize = () => {
    const r = host.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    const phone = w < 760;
    const dpr = Math.min(phone ? 1.5 : 1.75, devicePixelRatio || 1) * quality;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    normalTarget.setSize(Math.round(w * dpr), Math.round(h * dpr));
    (inkPass.uniforms.texel.value as THREE.Vector2).set(1 / (w * dpr), 1 / (h * dpr));
    camera.aspect = w / h;
    camera.fov = phone ? 34 : 24;
    if (w >= 1024) camera.setViewOffset(w, h, -w * 0.26, -h * 0.02, w, h);
    else camera.setViewOffset(w, h, 0, -h * 0.15, w, h);
    camera.updateProjectionMatrix();
  };

  const t0 = performance.now();
  let last = 0;
  let slow = 0;
  const frame = (now: number) => {
    const t = (now - t0) / 1000;
    steam.forEach((p, i) => {
      const k = (t * 0.3 + i / steam.length) % 1;
      p.position.set(2.2 + k * 0.9, 6.2 + k * 3, -1.2 - k * 0.5);
      p.scale.setScalar(0.4 + k * 1.2);
      p.visible = k < 0.9;
    });
    skyClouds.forEach((c, i) => {
      c.position.x += 0.01 + i * 0.002;
      if (c.position.x > 90) c.position.x = -90;
    });
    for (const [i, p] of Object.values(people).entries()) p.g.position.y = (p.g.userData.y ??= p.g.position.y) + Math.abs(Math.sin(t * 2.2 + i)) * 0.04;
    (beacon.material as THREE.MeshBasicMaterial).color.copy(C.glint).lerp(C.sheet, 0.3 + 0.3 * Math.sin(t * 2.4));
    (vaultGlow.material as THREE.MeshBasicMaterial).opacity = 1;
    world.rotation.y = baseRot + (opts.reduced ? 0 : Math.sin(t * 0.07) * 0.035);

    const jitter = shakeK > 0 ? new THREE.Vector3(Math.sin(t * 90) * shakeK * 0.22, Math.cos(t * 77) * shakeK * 0.16, 0) : new THREE.Vector3();
    camera.position.copy(cam.pos).add(jitter);
    camera.lookAt(cam.look);

    // normals and depth (no sky, no light) for the ink pass
    camera.layers.set(0);
    scene.overrideMaterial = normalMat;
    const fog = scene.fog;
    scene.fog = null;
    renderer.setRenderTarget(normalTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;
    scene.fog = fog;
    camera.layers.enableAll();
    composer.render();

    if (last) {
      slow = now - last > 26 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 50 && quality > 0.5) {
        quality *= 0.75;
        slow = 0;
        resize();
      }
    }
    last = now;
  };

  // ---------- setters ----------
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
  const city: City = {
    canvas,
    truck(t) {
      const k = ((t % 1) + 1) % 1;
      truck.position.copy(truckPath.getPointAt(k));
      // heading from the path's tangent (never from two equal points), the cab faces +x
      const tan = truckPath.getTangentAt(k);
      truck.rotation.set(0, Math.atan2(-tan.z, tan.x), 0);
      // wheels turn with the distance covered; the body pitches with acceleration
      const now = performance.now();
      const dist = t * truckLen;
      const dt = Math.max(1, now - drive.at) / 1000;
      // a jump (an episode jump, the loop closing) is a reset, not a burst of speed
      const jumped = Math.abs(dist - drive.dist) > 3;
      const v = drive.at && !jumped ? (dist - drive.dist) / dt : 0;
      const a = drive.at && dt < 0.1 && !jumped ? (v - drive.v) / dt : 0;
      drive.pitch += (Math.max(-0.06, Math.min(0.06, -a * 0.012)) - drive.pitch) * 0.2;
      Object.assign(drive, { dist, v, at: now });
      wheels.forEach((w) => (w.rotation.y = -dist / (0.22 * 0.85)));
      truckBody.rotation.z = drive.pitch;
      truckBody.position.y = 0.24 + Math.abs(Math.sin(dist * 5)) * 0.012 * Math.min(1, Math.abs(v) / 2);
    },
    shopStop,
    plane(route, t) {
      const g = route === "shop" ? planeShop : planeVault;
      g.visible = t >= 0 && t <= 1;
      if (g.visible) fly(g, routes[route], t);
      else trails.get(g)!.visible = false;
    },
    copyPlane(t, bounced = 0) {
      planeCopy.visible = t >= 0;
      if (!planeCopy.visible) {
        trails.get(planeCopy)!.visible = false;
        return;
      }
      fly(planeCopy, routes.copy, t, bounced * 2.6);
      if (bounced > 0) {
        planeCopy.position.add(new THREE.Vector3(-bounced * 1.6, -bounced * 2.4 + Math.sin(bounced * Math.PI) * 1.4, -bounced * 3));
        planeCopy.scale.setScalar(1.5 * (1 - bounced * 0.4));
        trails.get(planeCopy)!.visible = false;
      } else planeCopy.scale.setScalar(1.5);
    },
    sheet(shown, sealed) {
      sheetG.visible = shown;
      impression.visible = impressionDot.visible = sealed > 0;
      impression.scale.setScalar(0.7 + 0.3 * clamp01(sealed));
      (impressionDot.material as THREE.MeshBasicMaterial).opacity = 0.85 * clamp01(sealed);
    },
    stamp(down, squash = 0) {
      jitsuin.visible = down > 0.001;
      jitsuin.position.set(jBase.x, jBase.y + 0.05 + (1 - down) * 6, jBase.z);
      jBody.scale.set(1 + squash * 0.1, 1 - squash * 0.16, 1 + squash * 0.1);
      const sm = jShadow.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.32 * down;
      jShadow.scale.setScalar(0.5 + 0.7 * down);
    },
    burst(k) {
      burstG.visible = k > 0 && k < 1;
      burstG.children.forEach((hld, i) => {
        const m = hld.children[0];
        const len = 0.6 + (i % 3) * 0.35;
        m.position.x = 0.5 + k * 2.4;
        m.scale.set(len * (1 - k * 0.6), 1, 1);
      });
      burstM.opacity = 0.9 * (1 - k);
    },
    fingerprint(t) {
      nG.visible = t >= 0 && t <= 1;
      if (!nG.visible) return;
      nG.position.copy(nRoute.getPointAt(clamp01(t)));
      nG.quaternion.copy(world.quaternion).invert().multiply(camera.quaternion);
      // it swells on the way up, then shrinks into its row on the board
      nG.scale.setScalar(t < 0.8 ? 0.7 + 0.3 * Math.sin((Math.PI * t) / 0.8) : 0.7 - ((t - 0.8) / 0.2) * 0.5);
    },
    board(state) {
      if (state === boardState) return;
      boardState = state;
      repaint(boardTex, paintBoard);
    },
    vaultDoor(open) {
      doorPivot.rotation.y = -open * 1.8;
      (vaultGlow.material as THREE.MeshBasicMaterial).color.copy(C.pool2).lerp(C.glint, open);
    },
    beam(b, k, caught = false) {
      const m = b === "A" ? beamA : beamB;
      m.visible = k > 0.001;
      m.scale.set(1, Math.max(0.001, k) * (m.userData.len as number), 1);
      (m.material as THREE.MeshBasicMaterial).color.copy(caught ? C.seal : C.glint);
    },
    shutterB(closed) {
      const k = clamp01(closed);
      shutter.scale.y = Math.max(0.02, k);
      shutter.position.y = shutterTop - (1.9 * k) / 2;
      shutter.visible = k > 0.01;
    },
    verdict(kind, k) {
      const st = stamps[kind];
      st.m.opacity = clamp01(k);
      st.plate.visible = k > 0;
      st.plate.scale.setScalar(1.5 - 0.5 * Math.min(1, k));
      st.plate.quaternion.copy(world.quaternion).invert().multiply(camera.quaternion);
      st.plate.rotateZ(-0.12);
    },
    stream(kind, t) {
      const s = kind === "advance" ? advance : pay;
      s.pts.visible = t >= 0 && t <= 1.4;
      if (!s.pts.visible) return;
      const a = s.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < s.n; i++) {
        const k = t * 1.4 - (i / s.n) * 0.4;
        const p = s.curve.getPointAt(clamp01(k));
        a.setXYZ(i, p.x, k < 0 ? -80 : p.y + Math.sin(i * 1.7) * 0.12, p.z);
      }
      a.needsUpdate = true;
    },
    calendar(days) {
      const d = Math.max(0, Math.round(days));
      if (d === calDays) return;
      calDays = d;
      repaint(calTex, paintCal);
    },
    react(who, k) {
      const p = people[who];
      if (who === "bankB") p.headG.rotation.y = Math.sin(k * Math.PI * 4) * 0.5 * (1 - k);
      else p.arm.rotation.z = Math.sin(Math.PI * clamp01(k)) * 2.6;
      if (who === "buyer") p.g.position.y = (p.g.userData.y ?? 0.2) + Math.sin(Math.PI * clamp01(k)) * 0.3;
    },
    shake(k) {
      shakeK = k;
    },
    camera(view, par = { x: 0, y: 0 }, distance = 60) {
      baseRot = view.rot;
      cam.look.set(...view.look).applyAxisAngle(new THREE.Vector3(0, 1, 0), view.rot);
      cam.pos.copy(cam.look).addScaledVector(CAM_DIR, distance * view.zoom);
      const dir = cam.look.clone().sub(cam.pos).normalize();
      right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      up.crossVectors(right, dir).normalize();
      cam.pos.addScaledVector(right, par.x * 2.2).addScaledVector(up, par.y * 1.2);
    },
    frame,
    resize,
  };
  resize();
  city.camera({ rot: 0, zoom: 1, look: [0, 1.5, 0] });
  city.truck(0);
  city.sheet(false, 0);
  city.stamp(0);
  city.burst(0);
  city.vaultDoor(0);
  city.shutterB(0);
  for (const k of ["registered", "refused", "settled"] as const) city.verdict(k, 0);
  return city;
}
