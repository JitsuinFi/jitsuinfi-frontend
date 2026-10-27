// The QR codes the app shows (contact link, payment slip 払込票, deposit slip 入金票), read back
// from the SVG our own wasm draws (qrcode 0.14: a white rect, then one 1x1-module square per dark
// module, in pixels of its module size) into a grid of modules, so the app draws every QR the
// same way: an exact 4-module quiet zone, a whole number of CSS pixels per module (crisp, never
// stretched), in the palette's ink on the sheet. Pure: tests run it under Node.

/** Light modules around the code, as ISO/IEC 18004 asks. */
export const QUIET = 4;

/** Most CSS pixels a QR takes on a phone and on a wider screen (the enlarged sheet has its own). */
export const QR_CAP = { phone: 280, wide: 240 } as const;

/** The code's modules, without any quiet zone: `dark[y * n + x]`. */
export interface QrGrid {
  n: number;
  dark: Uint8Array;
}

/** The modules of a qrcode-rendered SVG (any quiet zone, any module size). */
export function parseQrSvg(svg: string): QrGrid {
  const d = /<path[^>]*\sd="([^"]+)"/.exec(svg)?.[1];
  if (!d) throw new Error("this is not a QR drawing");
  // each dark module is "M{x} {y}h{m}v{m}H{x}V{y}"
  const cells: Array<[number, number]> = [];
  let m = 0;
  for (const t of d.matchAll(/M(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)h(\d+(?:\.\d+)?)/g)) {
    cells.push([Number(t[1]), Number(t[2])]);
    m ||= Number(t[3]);
  }
  if (!cells.length || !m) throw new Error("this QR drawing has no modules");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of cells) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  // the three finder patterns put dark modules in the code's first and last row and column
  const n = Math.round((x1 - x0) / m) + 1;
  if (Math.round((y1 - y0) / m) + 1 !== n || n < 21 || (n - 17) % 4 !== 0) throw new Error("this QR drawing is not square");
  const dark = new Uint8Array(n * n);
  for (const [x, y] of cells) dark[Math.round((y - y0) / m) * n + Math.round((x - x0) / m)] = 1;
  return { n, dark };
}

/** Modules across, quiet zone included. */
export function qrSpan(g: QrGrid): number {
  return g.n + 2 * QUIET;
}

/** Fewest CSS pixels per module the app draws when the width allows it (a dense payment request). */
export const MIN_MODULE = 3;

/**
 * The drawn size of a QR of `modules` across in `avail` CSS px: a whole number of pixels per
 * module, so no module is ever blurred or stretched. At most `cap`, except that a dense code
 * (a payment request with its memo) may grow past the cap, never past `avail`, to keep
 * MIN_MODULE pixels a module; at least 1.
 */
export function qrFit(modules: number, avail: number, cap: number): { module: number; px: number } {
  const room = Math.max(0, Math.min(avail, cap));
  let module = Math.floor(room / modules);
  if (module < MIN_MODULE) module = Math.max(module, Math.min(MIN_MODULE, Math.floor(Math.max(0, avail) / modules)));
  module = Math.max(1, module);
  return { module, px: module * modules };
}

/** The dark modules as one SVG path in module units, quiet zone included (runs merged per row). */
export function qrPath(g: QrGrid): string {
  let d = "";
  for (let y = 0; y < g.n; y++) {
    let x = 0;
    while (x < g.n) {
      if (!g.dark[y * g.n + x]) {
        x++;
        continue;
      }
      const s = x;
      while (x < g.n && g.dark[y * g.n + x]) x++;
      d += `M${s + QUIET} ${y + QUIET}h${x - s}v1h-${x - s}z`;
    }
  }
  return d;
}

/**
 * RGBA pixels of the QR at `scale` px per module, quiet zone included: `ink` on `sheet` (each
 * [r, g, b]). The PNG download draws these; the tests decode them back with jsQR.
 */
export function qrPixels(g: QrGrid, scale: number, ink: [number, number, number], sheet: [number, number, number]): { size: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const size = qrSpan(g) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    const my = Math.floor(py / scale) - QUIET;
    for (let px = 0; px < size; px++) {
      const mx = Math.floor(px / scale) - QUIET;
      const on = my >= 0 && my < g.n && mx >= 0 && mx < g.n && g.dark[my * g.n + mx] === 1;
      const c = on ? ink : sheet;
      const i = (py * size + px) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { size, data };
}
