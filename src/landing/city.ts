// "Kota Piutang", the receivables town (MASTER Amendment 3): a floating diorama in an anime
// afternoon, cel-shaded with ink outlines. Everything the story needs is built here and exposed as
// plain setters the director drives: a supplier's workshop, the buyer's shop under a giant jitsuin,
// the Registry tower in the square (the public board, one lantern per fingerprint N), the shielded
// vault under a hatch, two financiers' banks, a delivery truck, paper-plane invoices, a calendar
// counting down the 60 days, and light streams for money.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const css = () => getComputedStyle(document.documentElement);
const token = (n: string) => new THREE.Color(css().getPropertyValue(n).trim());

export type LanternState = "off" | "lit" | "caught" | "settled";

/** A view of the town: the island turns (rot) so the subject faces a fixed 3/4 camera that
 *  dollies in (zoom < 1) toward a point given in island coordinates. */
export interface View {
  rot: number;
  zoom: number;
  look: [number, number, number];
}

/** The fixed camera direction (from the subject toward the camera). */
export const CAM_DIR = new THREE.Vector3(0.36, 0.58, 1).normalize();

export const SPOTS = {
  supplier: new THREE.Vector3(-7, 0, -4),
  buyer: new THREE.Vector3(6, 0, -6),
  tower: new THREE.Vector3(0, 0, 0),
  hatch: new THREE.Vector3(-2.6, 0, 2.6),
  bankA: new THREE.Vector3(-5.5, 0, 6),
  bankB: new THREE.Vector3(6.8, 0, 4.4),
  sheet: new THREE.Vector3(6, 0.08, -3.1),
};

export interface City {
  /** progress 0..1 of the truck from the workshop to the shop */
  truck(t: number): void;
  /** a paper plane on its route; t < 0 hides it */
  planeA(t: number): void;
  planeB(t: number, bounced?: number): void;
  /** the flat invoice in front of the shop: shown, sealed amount 0..1, sunk 0..1 */
  sheet(shown: boolean, sealed: number, sunk?: number): void;
  /** the jitsuin above the shop: 0 up, 1 pressed; squash 0..1 */
  stamp(down: number, squash?: number): void;
  /** the fingerprint N rising from the sheet to the tower; t < 0 hides */
  fingerprint(t: number): void;
  lantern(state: LanternState, glow?: number): void;
  hatch(open: number): void;
  /** a financier's beam to the tower: 0..1 grown */
  beam(bank: "A" | "B", k: number, caught?: boolean): void;
  gateB(closed: number): void;
  /** money as light: advance (bank A to supplier) or pay (shop to bank A), progress 0..1, < 0 hides */
  stream(kind: "advance" | "pay", t: number): void;
  /** calendar pages left out of 60, 0..60 */
  calendar(days: number): void;
  shake(k: number): void;
  camera(view: View, parallax?: { x: number; y: number }, distance?: number): void;
  frame(now: number): void;
  resize(): void;
  canvas: HTMLCanvasElement;
  destroy(): void;
}

function toonRamp(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([150, 208, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Text on a canvas, for the calendar and the fingerprint. Same-origin, no image loads. */
function label(text: string, opts: { w: number; h: number; font: string; fg: string; bg?: string; align?: CanvasTextAlign }): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = opts.w;
  c.height = opts.h;
  const g = c.getContext("2d")!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, opts.w, opts.h);
  }
  g.fillStyle = opts.fg;
  g.font = opts.font;
  g.textAlign = opts.align ?? "center";
  g.textBaseline = "middle";
  g.fillText(text, opts.align === "left" ? 16 : opts.w / 2, opts.h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createCity(host: HTMLElement, opts: { reduced: boolean; n: string }): City | null {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-field";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const C = {
    paper: token("--paper"), sheet: token("--sheet"), fiber: token("--fiber"), fold: token("--fold"),
    head: token("--head"), ink: token("--ink"), seal: token("--seal"), sealHi: token("--seal-hi"),
    pool: token("--pool"), pool2: token("--pool-2"), wave: token("--wave"), glint: token("--glint"), mist: token("--mist"),
  };
  const ramp = toonRamp();
  const toon = (color: THREE.Color, extra: Partial<THREE.MeshToonMaterialParameters> = {}) =>
    new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
  const glow = (color: THREE.Color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });

  // ink outline: a back-face hull pushed out along the normals
  const outlineMat = new THREE.MeshBasicMaterial({ color: C.head, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (s) => {
    s.uniforms.thickness = { value: 0.032 };
    s.vertexShader = "uniform float thickness;\n" + s.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = position + normal * thickness;");
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.paper.clone().lerp(C.mist, 0.35), 34, 90);

  // sky: an anime afternoon, mist-blue high up, paper white at the horizon, a warm-white sun
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: C.glint.clone().lerp(C.wave, 0.35) },
        mid: { value: C.mist.clone().lerp(C.glint, 0.35) },
        low: { value: C.paper.clone() },
        sun: { value: new THREE.Vector3(-0.55, 0.42, -0.72).normalize() },
        sunC: { value: C.sheet.clone() },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 top, mid, low, sun, sunC; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(low, mid, smoothstep(-0.05, 0.25, h));
          c = mix(c, top, smoothstep(0.2, 0.85, h));
          float s = max(dot(vDir, sun), 0.0);
          c += sunC * (pow(s, 64.0) * 0.9 + pow(s, 6.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(C.sheet, C.mist, 1.9));
  const sun = new THREE.DirectionalLight(C.sheet, 2.6);
  sun.position.set(-14, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);

  function add<T extends THREE.Object3D>(parent: THREE.Object3D, o: T): T {
    parent.add(o);
    return o;
  }
  function solid(parent: THREE.Object3D, geom: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number] = [0, 0, 0], outline = true): THREE.Mesh {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(...at);
    m.castShadow = true;
    m.receiveShadow = true;
    if (outline) {
      const o = new THREE.Mesh(geom, outlineMat);
      o.castShadow = false;
      m.add(o);
    }
    parent.add(m);
    return m;
  }
  const box = (w: number, h: number, d: number, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, r);
  /** a gable roof: a triangular prism along x */
  const gable = (w: number, h: number, d: number) => {
    const g = new THREE.CylinderGeometry(1, 1, w, 3, 1);
    g.rotateZ(Math.PI / 2);
    g.rotateX(Math.PI / 6);
    g.scale(1, h / 1.5, d / 1.73);
    return g;
  };

  // ---------- the island ----------
  const island = add(world, new THREE.Group());
  solid(island, new THREE.CylinderGeometry(13.2, 12.4, 0.6, 64), toon(C.mist), [0, -0.3, 0]);
  solid(island, new THREE.CylinderGeometry(12.4, 9.6, 2.4, 64), toon(C.pool2), [0, -1.8, 0]);
  solid(island, new THREE.ConeGeometry(9.6, 5.5, 48), toon(C.pool), [0, -5.75, 0]);
  // the hidden pool's light along the seam: the shielded side of the town
  add(island, new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.07, 8, 96), glow(C.glint))).rotation.x = Math.PI / 2;
  (island.children.at(-1) as THREE.Mesh).position.y = -0.62;
  // roads: a ring round the square and spokes to each house
  const roadMat = toon(C.paper);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.6, 64), roadMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.receiveShadow = true;
  island.add(ring);
  const spoke = (to: THREE.Vector3) => {
    const len = to.length() - 4;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, len), roadMat);
    s.rotation.x = -Math.PI / 2;
    s.rotation.z = -Math.atan2(to.x, to.z) + Math.PI;
    const mid = to.clone().setLength(4 + len / 2);
    s.position.set(mid.x, 0.011, mid.z);
    s.receiveShadow = true;
    island.add(s);
  };
  [SPOTS.supplier, SPOTS.buyer, SPOTS.bankA, SPOTS.bankB].forEach(spoke);
  // little trees (cones), the anime staple
  const treeMat = toon(C.pool2.clone().lerp(C.mist, 0.3));
  const trunkMat = toon(C.ink);
  for (const [x, z, s] of [[-10, 1, 1], [-9.4, 3.4, 0.8], [10.4, -1.4, 1], [2.5, -9.6, 0.9], [-2.8, -9.8, 1.1], [1.2, 10.2, 0.85], [9.6, 7.2, 0.8], [-10.6, -6, 0.9]] as const) {
    const t = add(island, new THREE.Group());
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    solid(t, new THREE.CylinderGeometry(0.12, 0.16, 0.7, 8), trunkMat, [0, 0.35, 0]);
    solid(t, new THREE.ConeGeometry(0.85, 1.9, 10), treeMat, [0, 1.6, 0]);
  }

  // ---------- the supplier's workshop: sawtooth roof, chimney, crates ----------
  const wall = toon(C.sheet);
  const roofMat = toon(C.head);
  const winMat = glow(C.glint);
  const workshop = add(world, new THREE.Group());
  workshop.position.copy(SPOTS.supplier);
  workshop.rotation.y = Math.PI * 0.22;
  solid(workshop, box(4.2, 2.2, 3, 0.1), wall, [0, 1.1, 0]);
  for (let i = 0; i < 3; i++) {
    const tooth = solid(workshop, new THREE.CylinderGeometry(0.85, 0.85, 3, 3), roofMat, [-1.4 + i * 1.4, 2.55, 0]);
    tooth.rotation.x = Math.PI / 2;
    tooth.rotation.y = Math.PI / 2;
    tooth.scale.set(1, 1, 0.8);
  }
  solid(workshop, new THREE.CylinderGeometry(0.28, 0.34, 2.2, 12), toon(C.seal), [1.6, 3.2, -0.8]);
  for (let i = 0; i < 4; i++) solid(workshop, new THREE.PlaneGeometry(0.55, 0.6), winMat, [-1.5 + i, 1.2, 1.51], false);
  for (const [x, z] of [[-2.8, 1.4], [-2.8, 0.6], [-2.2, 1.4]] as const) solid(workshop, box(0.7, 0.7, 0.7, 0.06), toon(C.fold.clone().lerp(C.sheet, 0.4)), [x, 0.35, z]);
  const steam: THREE.Mesh[] = [];
  const steamMat = toon(C.sheet, { transparent: true, opacity: 0.9 });
  for (let i = 0; i < 5; i++) {
    const p = solid(workshop, new THREE.SphereGeometry(0.42, 12, 10), steamMat, [1.6, 4.4, -0.8], false);
    p.castShadow = false;
    steam.push(p);
  }

  // ---------- the buyer's shop, with an awning ----------
  const shop = add(world, new THREE.Group());
  shop.position.copy(SPOTS.buyer);
  solid(shop, box(3.6, 2.6, 2.8, 0.1), wall, [0, 1.3, 0]);
  solid(shop, gable(3.9, 1.3, 3.1), roofMat, [0, 3.2, 0]);
  for (let i = 0; i < 6; i++) solid(shop, box(0.6, 0.12, 1.1, 0.03), toon(i % 2 ? C.sheet : C.seal), [-1.5 + i * 0.6, 2.05, 1.85], true).rotation.x = 0.35;
  solid(shop, new THREE.PlaneGeometry(2.2, 1), winMat, [0, 1.0, 1.41], false);

  // ---------- the Registry tower: the public board ----------
  const tower = add(world, new THREE.Group());
  tower.position.copy(SPOTS.tower);
  solid(tower, new THREE.CylinderGeometry(2.4, 2.8, 0.5, 6), toon(C.paper), [0, 0.25, 0]);
  solid(tower, new THREE.CylinderGeometry(0.9, 1.2, 8.4, 6), toon(C.pool), [0, 4.7, 0]);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 8.6, 6, 1, true), new THREE.MeshBasicMaterial({ color: C.mist, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  shell.position.y = 4.8;
  tower.add(shell);
  solid(tower, new THREE.ConeGeometry(1.9, 1.6, 6), roofMat, [0, 9.8, 0]);
  const finial = solid(tower, new THREE.SphereGeometry(0.3, 16, 12), glow(C.glint), [0, 10.8, 0], false);
  // lanterns: other invoices already on the board, and ours (index 4)
  const lanterns: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.06), glow(C.glint, i === 4 ? 0.0 : 0.55));
    const a = (i % 3) * ((Math.PI * 2) / 3) + 0.4;
    l.position.set(Math.sin(a) * 1.25, 1.6 + i * 0.82, Math.cos(a) * 1.25);
    l.rotation.y = a;
    tower.add(l);
    lanterns.push(l);
  }
  const ours = lanterns[4];
  const oursMat = ours.material as THREE.MeshBasicMaterial;
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.05, 48), glow(C.glint, 0));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = ours.position.y;
  tower.add(halo);

  // ---------- the shielded vault under a hatch ----------
  const vault = add(world, new THREE.Group());
  vault.position.copy(SPOTS.hatch);
  solid(vault, new THREE.CylinderGeometry(1.25, 1.25, 0.16, 32), toon(C.head), [0, 0.06, 0]);
  const vaultLight = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), glow(C.glint));
  vaultLight.rotation.x = -Math.PI / 2;
  vaultLight.position.y = 0.15;
  vault.add(vaultLight);
  const leafGeom = new THREE.CylinderGeometry(1.02, 1.02, 0.1, 32, 1, false, 0, Math.PI);
  const leafL = add(vault, new THREE.Group());
  const leafR = add(vault, new THREE.Group());
  solid(leafL, leafGeom, toon(C.pool2), [0, 0.2, 0]).rotation.y = 0;
  solid(leafR, leafGeom, toon(C.pool2), [0, 0.2, 0]).rotation.y = Math.PI;
  leafL.position.x = 0;
  leafR.position.x = 0;

  // ---------- the banks ----------
  const bank = (at: THREE.Vector3, turn: number, mark: THREE.Color) => {
    const g = add(world, new THREE.Group());
    g.position.copy(at);
    g.rotation.y = turn;
    solid(g, box(3.8, 0.4, 3, 0.06), toon(C.paper), [0, 0.2, 0]);
    solid(g, box(3.4, 2.4, 2.4, 0.08), wall, [0, 1.6, -0.2]);
    for (let i = 0; i < 4; i++) solid(g, new THREE.CylinderGeometry(0.16, 0.16, 2.2, 12), wall, [-1.35 + i * 0.9, 1.5, 1.2]);
    solid(g, gable(3.8, 1, 3), roofMat, [0, 3.25, 0]);
    solid(g, new THREE.CylinderGeometry(0.34, 0.34, 0.08, 24), toon(mark), [0, 3.15, 1.52]).rotation.x = Math.PI / 2;
    const doorL = add(g, new THREE.Group());
    const doorR = add(g, new THREE.Group());
    doorL.position.set(-0.55, 0, 1.0);
    doorR.position.set(0.55, 0, 1.0);
    solid(doorL, box(0.55, 1.6, 0.12, 0.03), toon(C.seal), [0.27, 1.2, 0]);
    solid(doorR, box(0.55, 1.6, 0.12, 0.03), toon(C.seal), [-0.27, 1.2, 0]);
    return { g, doorL, doorR };
  };
  bank(SPOTS.bankA, Math.PI * 0.82, C.glint);
  const B = bank(SPOTS.bankB, -Math.PI * 0.72, C.fold);

  // beams: a financier looking the fingerprint up on the board
  const beamGeom = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
  beamGeom.translate(0, 0.5, 0);
  const mkBeam = (from: THREE.Vector3) => {
    const m = new THREE.Mesh(beamGeom, glow(C.glint, 0.85));
    const a = from.clone().setY(3.2);
    const b = SPOTS.tower.clone().setY(ours.position.y);
    m.position.copy(a);
    m.userData.len = a.distanceTo(b);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.scale.set(1, 0.001, 1);
    m.visible = false;
    world.add(m);
    return m;
  };
  const beamA = mkBeam(SPOTS.bankA);
  const beamB = mkBeam(SPOTS.bankB);

  // ---------- the truck ----------
  const truck = add(world, new THREE.Group());
  truck.scale.setScalar(0.7);
  solid(truck, box(1.4, 0.9, 0.9, 0.08), toon(C.sheet), [-0.2, 0.75, 0]);
  solid(truck, box(0.6, 0.75, 0.86, 0.08), toon(C.seal), [0.85, 0.65, 0]);
  for (const [x, z] of [[-0.6, 0.45], [-0.6, -0.45], [0.75, 0.45], [0.75, -0.45]] as const) {
    solid(truck, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14), toon(C.head), [x, 0.22, z]).rotation.x = Math.PI / 2;
  }
  const truckPath = new THREE.CatmullRomCurve3([
    SPOTS.supplier.clone().add(new THREE.Vector3(2.4, 0, 1.4)),
    new THREE.Vector3(-3.6, 0, -1.6),
    new THREE.Vector3(0.6, 0, -4),
    new THREE.Vector3(4.2, 0, -3.4),
    SPOTS.buyer.clone().add(new THREE.Vector3(-1.4, 0, 2.6)),
  ]);

  // ---------- the paper-plane invoices ----------
  const planeGeom = new THREE.BufferGeometry();
  planeGeom.setAttribute("position", new THREE.Float32BufferAttribute([
    0.9, 0, 0, -0.5, 0, 0.55, -0.35, -0.05, 0, // left wing
    0.9, 0, 0, -0.35, -0.05, 0, -0.5, 0, -0.55, // right wing
    0.9, 0, 0, -0.35, -0.05, 0, -0.45, -0.28, 0, // keel
  ], 3));
  planeGeom.computeVertexNormals();
  const paperMat = toon(C.sheet, { side: THREE.DoubleSide });
  const mkPlane = () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(planeGeom, paperMat);
    m.castShadow = true;
    g.add(m);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), glow(C.seal));
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(-0.1, 0.005, 0.22);
    g.add(dot);
    g.scale.setScalar(1.3);
    g.visible = false;
    world.add(g);
    return g;
  };
  const pA = mkPlane();
  const pB = mkPlane();
  const routeA = new THREE.CatmullRomCurve3([
    SPOTS.supplier.clone().setY(3.4), new THREE.Vector3(-3, 5.6, -5.6), new THREE.Vector3(2.4, 4.4, -2.6), SPOTS.sheet.clone().setY(0.6),
  ]);
  const routeB = new THREE.CatmullRomCurve3([
    SPOTS.supplier.clone().setY(3.4), new THREE.Vector3(-2, 6.2, 1.2), new THREE.Vector3(3.6, 4.6, 3.8), SPOTS.bankB.clone().add(new THREE.Vector3(-1, 1.6, -0.6)),
  ]);
  const flyTo = (g: THREE.Object3D, curve: THREE.CatmullRomCurve3, t: number, roll = 0) => {
    const p = curve.getPointAt(Math.min(1, Math.max(0, t)));
    const ahead = curve.getPointAt(Math.min(1, t + 0.01));
    g.position.copy(p);
    g.lookAt(ahead);
    g.rotateY(-Math.PI / 2);
    g.rotateX(Math.sin(t * Math.PI * 2) * 0.35 + roll);
  };

  // ---------- the flat invoice, its impression, the jitsuin ----------
  const sheetG = add(world, new THREE.Group());
  sheetG.position.copy(SPOTS.sheet);
  const sheetMesh = solid(sheetG, box(1.5, 0.04, 2.0, 0.01), toon(C.sheet), [0, 0, 0]);
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(i === 0 ? 0.5 : 1.1, 0.05), glow(C.fiber));
    r.rotation.x = -Math.PI / 2;
    r.position.set(i === 0 ? -0.35 : 0, 0.03, -0.7 + i * 0.28);
    sheetG.add(r);
  }
  const impression = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.36, 40), glow(C.seal));
  impression.rotation.x = -Math.PI / 2;
  impression.position.set(0.35, 0.031, 0.55);
  sheetG.add(impression);
  const impressionDot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), glow(C.seal, 0.85));
  impressionDot.rotation.x = -Math.PI / 2;
  impressionDot.position.set(0.35, 0.032, 0.55);
  sheetG.add(impressionDot);
  sheetMesh.castShadow = true;

  const jitsuin = add(world, new THREE.Group());
  const jBase = SPOTS.sheet.clone().add(new THREE.Vector3(0.35, 0, 0.55));
  jitsuin.position.copy(jBase);
  const jBody = add(jitsuin, new THREE.Group());
  solid(jBody, new THREE.CylinderGeometry(0.42, 0.42, 1.0, 32), toon(C.seal), [0, 0.5, 0]);
  solid(jBody, new THREE.CylinderGeometry(0.2, 0.3, 0.9, 24), toon(C.sealHi), [0, 1.45, 0]);
  solid(jBody, new THREE.SphereGeometry(0.34, 24, 16), toon(C.seal), [0, 2.05, 0]);

  // the fingerprint N, as a floating plaque of light
  const nTex = label(opts.n.slice(0, 8), { w: 512, h: 128, font: '500 76px "Geist Mono Variable", "Geist Mono", ui-monospace, monospace', fg: "#FCFCFE" });
  const nPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: nTex, transparent: true, color: C.sheet, toneMapped: false, depthWrite: false }));
  const nBack = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.66), glow(C.glint, 0.85));
  nBack.position.z = -0.01;
  const nG = add(world, new THREE.Group());
  nG.add(nBack, nPlate);
  nG.visible = false;
  const nRoute = new THREE.CatmullRomCurve3([SPOTS.sheet.clone().setY(1.0), new THREE.Vector3(4, 5.2, -2), new THREE.Vector3(1.6, ours.position.y + 1.2, 0.8), SPOTS.tower.clone().setY(ours.position.y).add(new THREE.Vector3(0, 0, 1.4))]);

  // ---------- money as light ----------
  const mkStream = (curve: THREE.CatmullRomCurve3, color: THREE.Color) => {
    const n = 26;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geom, new THREE.PointsMaterial({ color, size: 0.34, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }));
    pts.visible = false;
    world.add(pts);
    return { pts, curve, n };
  };
  const advance = mkStream(new THREE.CatmullRomCurve3([SPOTS.bankA.clone().setY(2.6), new THREE.Vector3(-8, 4.5, 2), SPOTS.supplier.clone().setY(2.6)]), C.glint);
  const pay = mkStream(new THREE.CatmullRomCurve3([SPOTS.buyer.clone().setY(2.6), new THREE.Vector3(2, 5.6, 2.4), new THREE.Vector3(-3, 4.8, 5.4), SPOTS.bankA.clone().setY(2.6)]), C.sheet);

  // ---------- the calendar above the workshop ----------
  const cal = add(world, new THREE.Group());
  cal.position.copy(SPOTS.supplier).add(new THREE.Vector3(0.4, 6.2, 0.6));
  const calTex = (d: number) => label(d > 0 ? `${d} days` : "Due", { w: 512, h: 384, font: '700 132px "Shippori Mincho B1", "Hiragino Mincho ProN", serif', fg: d > 0 ? "#020D2F" : "#7E2A53", bg: "#FCFCFE" });
  const calFace = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.65), new THREE.MeshBasicMaterial({ map: calTex(60), toneMapped: false }));
  cal.add(calFace);
  const calTop = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.32), glow(C.seal));
  calTop.position.y = 0.98;
  cal.add(calTop);
  const calBack = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.95), glow(C.head));
  calBack.position.set(0, 0.12, -0.02);
  cal.add(calBack);
  let calShown = 60;

  // ---------- clouds ----------
  const cloudMat = toon(C.sheet);
  const clouds: THREE.Group[] = [];
  for (const [x, y, z, s] of [[-20, 9, -24, 2.2], [14, 11, -28, 2.8], [26, 7, -6, 1.8], [-28, 6, 6, 2], [4, 13, -36, 3.2], [-10, 4, 22, 1.4]] as const) {
    const c = add(scene, new THREE.Group());
    c.position.set(x, y, z);
    c.scale.setScalar(s);
    for (const [dx, dy, r] of [[0, 0, 1.2], [1.3, -0.2, 0.9], [-1.2, -0.25, 0.85], [0.5, 0.6, 0.8], [-0.4, 0.5, 0.7]] as const) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), cloudMat);
      m.position.set(dx, dy, 0);
      c.add(m);
    }
    clouds.push(c);
  }

  // a sea of clouds under the town, and far islands in the haze: the town floats
  const floorMat = toon(C.sheet);
  const floor = add(scene, new THREE.Group());
  floor.position.y = -11;
  const fr = (() => {
    let x = 7;
    return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  })();
  for (let i = 0; i < 70; i++) {
    const a = fr() * Math.PI * 2;
    const r = 8 + fr() * 62;
    const m = new THREE.Mesh(new THREE.SphereGeometry(3 + fr() * 5, 14, 10), floorMat);
    m.position.set(Math.cos(a) * r, fr() * 2.4, Math.sin(a) * r);
    m.scale.y = 0.45;
    floor.add(m);
  }
  const far = (x: number, y: number, z: number, s: number) => {
    const g = add(scene, new THREE.Group());
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    solid(g, new THREE.CylinderGeometry(3, 2.6, 0.5, 24), toon(C.mist), [0, 0, 0]);
    solid(g, new THREE.ConeGeometry(2.6, 3.6, 20), toon(C.pool2.clone().lerp(C.mist, 0.5)), [0, -2, 0]);
    solid(g, new THREE.ConeGeometry(0.8, 2, 8), treeMat, [-1, 1.2, 0.4]);
    solid(g, new THREE.ConeGeometry(0.6, 1.5, 8), treeMat, [0.8, 1, -0.6]);
    solid(g, box(1.2, 1, 1, 0.08), wall, [0.6, 0.6, 1]);
  };
  far(-34, 4, -30, 1.2);
  far(30, -1, -40, 1.6);
  far(-46, -3, 6, 1);

  // ---------- camera ----------
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  const cam = { pos: new THREE.Vector3(2, 17, 26), look: new THREE.Vector3(0, 1.5, 0) };
  let baseRot = 0;
  let shakeK = 0;

  let W = 1, H = 1, quality = 1;
  const resize = () => {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    const phone = W < 760;
    renderer.setPixelRatio(Math.min(phone ? 1.5 : 2, devicePixelRatio || 1) * quality);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = phone ? 46 : 34;
    // the town sits right of the copy on wide screens, below it on phones
    if (W >= 1024) camera.setViewOffset(W, H, -W * 0.22, -H * 0.02, W, H);
    else camera.setViewOffset(W, H, 0, -H * 0.16, W, H);
    camera.updateProjectionMatrix();
  };

  const t0 = performance.now();
  let lastFrame = 0;
  let slow = 0;
  function frame(now: number) {
    const t = (now - t0) / 1000;
    // ambient life: steam, clouds, the finial's breath, a slow orbit of the whole world
    steam.forEach((p, i) => {
      const k = ((t * 0.35 + i / steam.length) % 1);
      p.position.set(1.6 + k * 0.8, 4.4 + k * 3.2, -0.8 - k * 0.4);
      p.scale.setScalar(0.4 + k * 1.1);
      (p.material as THREE.MeshToonMaterial).opacity = 0.9;
      p.visible = k < 0.92;
    });
    clouds.forEach((c, i) => (c.position.x += Math.sin(t * 0.05 + i) * 0.004 + 0.006));
    clouds.forEach((c) => c.position.x > 40 && (c.position.x = -40));
    (finial.material as THREE.MeshBasicMaterial).color.copy(C.glint).lerp(C.sheet, 0.25 + 0.25 * Math.sin(t * 2));
    world.rotation.y = baseRot + (opts.reduced ? 0 : Math.sin(t * 0.06) * 0.04);

    const shake = shakeK > 0 ? new THREE.Vector3(Math.sin(t * 90) * shakeK * 0.18, Math.cos(t * 77) * shakeK * 0.14, 0) : new THREE.Vector3();
    camera.position.copy(cam.pos).add(shake);
    camera.lookAt(cam.look);
    renderer.render(scene, camera);

    // slow GPU: lower the pixel ratio after a run of slow frames
    if (lastFrame) {
      slow = now - lastFrame > 26 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 50 && quality > 0.5) {
        quality *= 0.75;
        slow = 0;
        resize();
      }
    }
    lastFrame = now;
  }

  // ---------- setters ----------
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const city: City = {
    canvas,
    truck(t) {
      const k = Math.min(1, Math.max(0, t));
      truck.position.copy(truckPath.getPointAt(k));
      const ahead = truckPath.getPointAt(Math.min(1, k + 0.01));
      truck.lookAt(ahead);
      truck.rotateY(-Math.PI / 2);
    },
    planeA(t) {
      pA.visible = t >= 0 && t <= 1;
      if (pA.visible) flyTo(pA, routeA, t);
    },
    planeB(t, bounced = 0) {
      pB.visible = t >= 0;
      if (!pB.visible) return;
      flyTo(pB, routeB, t, bounced * 2.4);
      if (bounced > 0) {
        pB.position.add(new THREE.Vector3(-bounced * 2.2, -bounced * 3.4, -bounced * 1.4));
        pB.scale.setScalar(1.3 * (1 - bounced * 0.5));
      } else pB.scale.setScalar(1.3);
    },
    sheet(shown, sealed, sunk = 0) {
      sheetG.visible = shown;
      impression.visible = impressionDot.visible = sealed > 0;
      impression.scale.setScalar(0.6 + 0.4 * Math.min(1, sealed));
      (impressionDot.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.min(1, sealed);
      // sinking: it slides to the hatch and goes under
      const at = SPOTS.sheet.clone().lerp(SPOTS.hatch.clone().setY(0.25), Math.min(1, sunk * 1.6));
      at.y -= Math.max(0, sunk - 0.62) * 4;
      sheetG.position.copy(at);
      sheetG.rotation.y = sunk * 1.4;
    },
    stamp(down, squash = 0) {
      jitsuin.position.copy(jBase).add(new THREE.Vector3(0, 0.05 + (1 - down) * 5.5, 0));
      jBody.scale.set(1 + squash * 0.08, 1 - squash * 0.14, 1 + squash * 0.08);
      jitsuin.visible = down > 0.001;
    },
    fingerprint(t) {
      nG.visible = t >= 0 && t <= 1;
      if (!nG.visible) return;
      nG.position.copy(nRoute.getPointAt(Math.min(1, t)));
      nG.quaternion.copy(world.quaternion).invert().multiply(camera.quaternion);
      nG.scale.setScalar(0.6 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + (t > 0.9 ? 0 : 0));
    },
    lantern(state, k = 1) {
      const c = state === "caught" ? C.seal : state === "settled" ? C.sheet : C.glint;
      oursMat.color.copy(c);
      oursMat.transparent = true;
      oursMat.opacity = state === "off" ? 0 : Math.min(1, 0.35 + 0.65 * k);
      const hm = halo.material as THREE.MeshBasicMaterial;
      hm.color.copy(c);
      hm.opacity = state === "off" ? 0 : 0.85 * k;
      halo.scale.setScalar(1 + (1 - k) * 0.6);
    },
    hatch(open) {
      leafL.rotation.z = open * 1.9;
      leafR.rotation.z = -open * 1.9;
      leafL.position.x = -open * 1.0;
      leafR.position.x = open * 1.0;
      (vaultLight.material as THREE.MeshBasicMaterial).color.copy(C.pool2).lerp(C.glint, open);
    },
    beam(b, k, caught = false) {
      const m = b === "A" ? beamA : beamB;
      m.visible = k > 0.001;
      m.scale.set(1, Math.max(0.001, k) * (m.userData.len as number), 1);
      (m.material as THREE.MeshBasicMaterial).color.copy(caught ? C.seal : C.glint);
    },
    gateB(closed) {
      B.doorL.rotation.y = -(1 - closed) * 1.4;
      B.doorR.rotation.y = (1 - closed) * 1.4;
    },
    stream(kind, t) {
      const s = kind === "advance" ? advance : pay;
      s.pts.visible = t >= 0 && t <= 1.4;
      if (!s.pts.visible) return;
      const a = s.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < s.n; i++) {
        const k = t * 1.4 - (i / s.n) * 0.4;
        const p = s.curve.getPointAt(Math.min(1, Math.max(0, k)));
        a.setXYZ(i, p.x, k < 0 ? -50 : p.y + Math.sin(i * 1.7) * 0.12, p.z);
      }
      a.needsUpdate = true;
    },
    calendar(days) {
      const d = Math.max(0, Math.round(days));
      if (d === calShown) return;
      calShown = d;
      const m = calFace.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = calTex(d);
      m.needsUpdate = true;
    },
    shake(k) {
      shakeK = k;
    },
    camera(view, par = { x: 0, y: 0 }, distance = 34) {
      baseRot = view.rot;
      // the look point turns with the island
      cam.look.set(...view.look).applyAxisAngle(new THREE.Vector3(0, 1, 0), view.rot);
      cam.pos.copy(cam.look).addScaledVector(CAM_DIR, distance * view.zoom);
      // pointer parallax across the view plane
      const dir = cam.look.clone().sub(cam.pos).normalize();
      right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      up.crossVectors(right, dir).normalize();
      cam.pos.addScaledVector(right, par.x * 1.4).addScaledVector(up, par.y * 0.8);
    },
    frame,
    resize,
    destroy() {
      renderer.dispose();
      canvas.remove();
    },
  };
  resize();
  city.camera({ rot: 0, zoom: 1, look: [0, 1.5, 0] });
  city.truck(0);
  city.sheet(false, 0);
  city.stamp(0);
  city.lantern("off");
  city.hatch(0);
  city.gateB(0);
  return city;
}
