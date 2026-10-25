// The handed-in sheet of #/verify (HNK-34.T4): one line per check the registry ran, drawn as SVG
// markup that lies on the counter under the clerk's loupe. Pure (no DOM, no wasm) so tests run it
// under Node. The sheet carries its paint as SVG presentation attributes, not CSS classes: the
// loupe shows it again through <use>, and a use-element copy does not match the page's selectors.
// Same-origin CSP: no style attributes, no script; colours are DS-PAL only.

/** The small mark a check gets: 認 holds, 偽 fails, 重 already registered, 待 not checked; "" is a line read. */
export type Stamp = "認" | "偽" | "重" | "待" | "";

/** The drawing at the left of a line. */
export type Glyph = "seal" | "seals2" | "seals3" | "n" | "board" | "settled" | "doc" | "amount" | "order" | "key";

export interface SheetRow {
  g: Glyph;
  what: string;
  found: string;
  stamp: Stamp;
  mono?: boolean;
  /** For the letter's three seals: how many are still open (dashed). */
  open?: number;
  /** Not read: the sheet was refused before this line. */
  unread?: boolean;
}

export interface Sheet {
  /** "Verification bundle (JTSB)" etc. */
  kind: string;
  /** The code handed in; its head is printed under the kind. */
  code: string;
  rows: SheetRow[];
}

export interface Placed extends SheetRow {
  y: number;
  h: number;
  cy: number;
  lines: string[];
}

export interface Layout {
  W: number;
  H: number;
  rows: Placed[];
  /** x of the line text and of the marks. */
  tx: number;
  mx: number;
  narrow: boolean;
}

/* ---------- the camera: the sheet lies on the counter, turned 4° and pitched to k = .8 ---------- */
export const AZ = (4 * Math.PI) / 180;
export const K = 0.8;
const ZF = Math.sqrt(1 - K * K);
const CS = Math.cos(AZ);
const SN = Math.sin(AZ);
/** Projects a point of the counter plane (x, y) at height z. */
export const P = (x: number, y: number, z = 0): [number, number] => [x * CS - y * SN, K * (x * SN + y * CS) - z * ZF];
/** The same projection as an SVG transform, for a group lying flat at height z. */
export const M = (z = 0): string => `matrix(${CS} ${K * SN} ${-SN} ${K * CS} 0 ${-z * ZF})`;
/** Screen point (in the scene's user space) back to the counter plane. */
export function unproject(x: number, y: number): [number, number] {
  const yk = y / K;
  return [x * CS + yk * SN, -x * SN + yk * CS];
}

export function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(" ")) {
    if ((line + " " + w).trim().length > n && line) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}
export const chunk = (s: string, n: number): string[] => s.match(new RegExp(`.{1,${n}}`, "g")) ?? [s];

export function layout(sheet: Sheet | null, narrow: boolean): Layout {
  const W = narrow ? 372 : 560;
  const maxCh = narrow ? 36 : 62;
  const monoCh = narrow ? 32 : 64;
  let y = 64;
  const rows: Placed[] = [];
  for (const r of sheet ? sheet.rows : []) {
    const lines = r.mono ? chunk(r.found, monoCh) : wrap(r.found, maxCh);
    const h = 24 + lines.length * 17 + 6;
    rows.push({ ...r, y, h, lines, cy: y + h / 2 });
    y += h;
  }
  return { W, H: Math.max(y + 16, 380), rows, tx: 62, mx: W - 28, narrow };
}

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FM = "'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', serif";
const FS = "'Geist Variable', Geist, ui-sans-serif, system-ui, sans-serif";
const FX = "'Geist Mono Variable', 'Geist Mono', ui-monospace, Menlo, monospace";
const A = {
  sheet: `fill="#FCFCFE" stroke="#C4C7F2" stroke-width="1"`,
  rule: `fill="none" stroke="#ECD0EC" stroke-width="1"`,
  ruleH: `fill="none" stroke="#C4C7F2" stroke-width="1"`,
  kind: `font-family="${FM}" font-weight="700" font-size="16" fill="#020D2F"`,
  head: `font-family="${FX}" font-size="10" fill="#502A50"`,
  jp: `font-family="${FM}" font-weight="700" font-size="12" fill="#7E2A53" letter-spacing="3.6" text-anchor="end"`,
  what: `font-family="${FS}" font-weight="500" font-size="12" fill="#502A50"`,
  found: `font-family="${FS}" font-size="13.5" fill="#461D3A"`,
  mono: `font-family="${FX}" font-size="11" fill="#020D2F"`,
  ghost: `font-family="${FS}" font-size="12" fill="#502A50" opacity=".6"`,
  g: `fill="none" stroke="#502A50" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"`,
  gs: `fill="none" stroke="#7E2A53" stroke-width="1.6"`,
  gsf: `fill="none" stroke="#7E2A53" stroke-width=".8"`,
  gk: `font-family="${FM}" font-weight="800" font-size="11" fill="#7E2A53" text-anchor="middle"`,
  gn: `font-family="${FM}" font-weight="800" font-size="17" font-style="italic" fill="#020D2F" text-anchor="middle"`,
  gt: `font-family="${FS}" font-weight="500" font-size="10" fill="#502A50" text-anchor="middle"`,
  mk: `font-family="${FM}" font-weight="800" font-size="14" text-anchor="middle"`,
};

export function glyph(g: Glyph, cx: number, cy: number, open = 0): string {
  switch (g) {
    case "seal":
      return `<circle ${A.gs} cx="${cx}" cy="${cy}" r="12"/><circle ${A.gsf} cx="${cx}" cy="${cy}" r="9"/><text ${A.gk} x="${cx}" y="${cy + 4}">買</text>`;
    case "seals2":
      return `<circle ${A.gs} cx="${cx - 5}" cy="${cy}" r="10"/><circle ${A.gs} cx="${cx + 6}" cy="${cy + 1}" r="10"/><text ${A.gk} x="${cx}" y="${cy + 4}">売</text>`;
    case "seals3":
      return [-11, 0, 11]
        .map((d, i) => (i >= 3 - open ? `<circle ${A.g} cx="${cx + d}" cy="${cy}" r="5.5" stroke-dasharray="2 2"/>` : `<circle ${A.gs} cx="${cx + d}" cy="${cy}" r="5.5"/>`))
        .join("");
    case "n":
      return `<text ${A.gn} x="${cx}" y="${cy + 6}">N</text>`;
    case "board":
      return `<rect ${A.g} x="${cx - 13}" y="${cy - 9}" width="26" height="18" rx="2"/><line ${A.g} x1="${cx - 13}" y1="${cy - 3}" x2="${cx + 13}" y2="${cy - 3}"/><line ${A.g} x1="${cx - 13}" y1="${cy + 3}" x2="${cx + 13}" y2="${cy + 3}"/><line ${A.gs} x1="${cx - 9}" y1="${cy}" x2="${cx + 6}" y2="${cy}"/>`;
    case "settled":
      return `<circle ${A.gs} cx="${cx}" cy="${cy}" r="12" stroke-dasharray="5 2"/><text ${A.gk} x="${cx}" y="${cy + 4}">済</text>`;
    case "doc":
      return `<path ${A.g} d="M${cx - 8} ${cy - 11}h11l5 5v17h-16z M${cx + 3} ${cy - 11}v5h5"/><line ${A.g} x1="${cx - 5}" y1="${cy + 1}" x2="${cx + 5}" y2="${cy + 1}"/><line ${A.g} x1="${cx - 5}" y1="${cy + 5}" x2="${cx + 3}" y2="${cy + 5}"/>`;
    case "amount":
      return `<line ${A.g} x1="${cx - 12}" y1="${cy + 3}" x2="${cx + 12}" y2="${cy + 3}"/><line ${A.g} x1="${cx - 12}" y1="${cy + 6}" x2="${cx + 12}" y2="${cy + 6}"/><text ${A.gt} x="${cx}" y="${cy - 1}">ZEC</text>`;
    case "order":
      return `<text ${A.gt} x="${cx}" y="${cy + 4}">①→②</text>`;
    case "key":
      return `<circle ${A.g} cx="${cx - 6}" cy="${cy}" r="6"/><path ${A.g} d="M${cx} ${cy}h12M${cx + 8} ${cy}v5M${cx + 12} ${cy}v4"/>`;
  }
}

/** A check's small mark, hidden until the loupe presses it: a ring (認), filled (偽, 重), dashed (待), or a dot for a line read. */
export function markSvg(r: SheetRow): string {
  if (!r.stamp) return `<g class="vf-mark" data-dot="1" opacity="0"><circle r="2.6" fill="#502A50"/></g>`;
  const bad = r.stamp === "偽" || r.stamp === "重";
  const wait = r.stamp === "待";
  const ink = wait ? "#502A50" : "#7E2A53";
  return `<g class="vf-mark" opacity="0" transform="rotate(-10) scale(1.9)"><rect x="-14" y="-14" width="28" height="28" rx="5" fill="${bad ? ink : "none"}" stroke="${ink}" stroke-width="1.6"${wait ? ` stroke-dasharray="3 2.4"` : ""}/><text ${A.mk} y="5" fill="${bad ? "#FCFCFE" : ink}">${r.stamp}</text></g>`;
}

/** The ghosts on the blank sheet: what the loupe will read once something is handed in. */
const GHOSTS: Array<[Glyph, string]> = [
  ["seal", "the buyer's seal"],
  ["seals3", "the letter's seals"],
  ["n", "fingerprint N"],
  ["board", "its row on the public board"],
  ["settled", "the settled mark"],
];

/** The sheet's markup, in the counter plane (0..W, 0..H). Rows are `<g class="vf-row" data-i>`. */
export function docSvg(L: Layout, sheet: Sheet | null): string {
  let s = `<rect ${A.sheet} x="0" y="0" width="${L.W}" height="${L.H}" rx="3"/>`;
  if (!sheet) {
    s += `<text ${A.kind} x="22" y="34" opacity=".45">No sheet yet</text><text ${A.head} x="22" y="50" opacity=".75">the sheet you hand in lies here, under the loupe</text><line ${A.ruleH} x1="0" y1="62" x2="${L.W}" y2="62"/>`;
    GHOSTS.forEach(([g, t], i) => {
      const y = 64 + i * 58;
      s += `<line ${A.rule} x1="16" y1="${y + 58}" x2="${L.W - 16}" y2="${y + 58}"/><g opacity=".32">${glyph(g, 32, y + 29, g === "seals3" ? 3 : 0)}</g><text ${A.ghost} x="${L.tx}" y="${y + 33}">${t}</text>`;
    });
    return s;
  }
  s += `<text ${A.kind} x="22" y="32">${esc(sheet.kind)}</text><text ${A.head} x="22" y="49">${esc(sheet.code.slice(0, L.narrow ? 30 : 46))}…</text>`;
  s += `<text ${A.jp} x="${L.W - 22}" y="32" lang="ja">提出書類</text><line ${A.ruleH} x1="0" y1="60" x2="${L.W}" y2="60"/>`;
  L.rows.forEach((r, i) => {
    s += `<g class="vf-row" data-i="${i}">${glyph(r.g, 32, r.cy, r.open ?? 0)}<text ${A.what} x="${L.tx}" y="${r.y + 20}">${esc(r.what)}</text>`;
    r.lines.forEach((ln, j) => {
      s += `<text ${r.mono ? A.mono : A.found} x="${L.tx}" y="${r.y + 38 + j * 17}">${esc(ln)}</text>`;
    });
    s += `<line ${A.rule} x1="16" y1="${r.y + r.h}" x2="${L.W - 16}" y2="${r.y + r.h}"/>`;
    if (!r.unread) s += `<g transform="translate(${L.mx} ${r.cy})">${markSvg(r)}</g>`;
    s += `</g>`;
  });
  return s;
}
