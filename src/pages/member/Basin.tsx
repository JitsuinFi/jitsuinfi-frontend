// The fund as a section through its shielded pool (HNK-30.T22, approved sample
// design-samples/internal/member.html; moved from MemberPage.tsx in the IA port, 2026-10-26): the
// levels drawn to scale from the newest path's portfolio (cash on top, the advances out by due
// bucket, the overdue as silt, repayments as ripples) and the owed-to-members line from the
// solvency report, with the member's share on it. Pure drawing: the figures come from the page.
import { useEffect, useRef, type ReactNode } from "react";
import type { Portfolio } from "../../lib/fund";
import { poolLevels } from "../../lib/fund-pool";
import { units, zec } from "./data";

const W = 680;
const TOP = 64;
const FLOOR = 384;
const X0T = 40;
const X1T = 560;
const X0B = 112;
const X1B = 488;
const xl = (y: number) => X0T + ((X0B - X0T) * (y - TOP)) / (FLOOR - TOP);
const xr = (y: number) => X1T + ((X1B - X1T) * (y - TOP)) / (FLOOR - TOP);
const band = (y0: number, y1: number) => `${xl(y1)},${y1} ${xr(y1)},${y1} ${xr(y0)},${y0} ${xl(y0)},${y0}`;
const BUCKET = ["≤ 30 days", "31–90 days", "later"];

export function Basin({ p, period, owed, assets, mine, under, empty }: { p: Portfolio | null; period: number | null; owed: number | null; assets: number | null; mine: number; under: number; empty: string }): ReactNode {
  const svg = useRef<SVGSVGElement>(null);
  const L = p ? poolLevels({ cash_zat: p.cash_zat, open_zat: p.open_zat, overdue_zat: p.overdue_zat, owed_zat: owed, mine_units: under }, FLOOR - TOP) : null;
  const yO = FLOOR - (L?.overdue ?? 0);
  const yA = yO - (L?.open ?? 0);
  const yC = yA - (L?.cash ?? 0);
  // the pool fills again when its figures change
  const sig = p ? `${period}|${p.cash_zat}|${p.open_zat}|${p.overdue_zat}|${owed}` : "";
  useEffect(() => {
    const el = svg.current;
    if (!el || !sig) return;
    el.classList.remove("is-fill");
    void el.getBoundingClientRect();
    el.classList.add("is-fill");
  }, [sig]);

  let desc = "The fund's shielded pool in section. ";
  const right: Array<{ y: number; cls: string; lines: Array<[string, string]> }> = [];
  const parts: ReactNode[] = [];
  if (p && L && !L.empty) {
    desc += `Cash ${zec(p.cash_zat)} on top; ${p.open} advance${p.open === 1 ? "" : "s"} out, ${zec(p.open_zat)}, ${p.due_within[0]} due within 30 days, ${p.due_within[1]} within 31 to 90, ${p.due_within[2]} later; ${p.overdue} overdue${p.overdue_face_zat ? `, ${zec(p.overdue_face_zat)} unpaid` : ""}, counted 0 until repaid; ${p.repaid} repaid.`;
    // the advances out, one block per due bucket, sized by count (the path carries counts only)
    const total = p.due_within[0] + p.due_within[1] + p.due_within[2];
    const L0 = xl(yO);
    const span = xr(yO) - L0;
    let at = 0;
    const blocks: ReactNode[] = [];
    if (L.open > 0 && total > 0) {
      p.due_within.forEach((c, i) => {
        if (!c) return;
        const xs = L0 + at;
        const w = (span * c) / total;
        if (at > 0) blocks.push(<line key={`d${i}`} x1={xs} x2={xs} y1={yA} y2={yO} className="fm-split" />);
        if (L.open >= 34 && w >= 96) {
          blocks.push(
            <text key={`t${i}`} className="t-mist opt" x={xs + 12} y={yA + 22}>
              {`${c} due ${BUCKET[i]}`}
            </text>,
          );
        }
        at += w;
      });
    }
    parts.push(
      <g clipPath="url(#fm-bc)" key="lv">
        {L.overdue > 0 ? <rect className="fm-lv d0" x="0" y={yO} width={W} height={FLOOR - yO} fill="url(#fm-silt)" /> : null}
        {L.open > 0 ? (
          <g className="fm-lv d1">
            <rect x="0" y={yA} width={W} height={yO - yA} className="fm-open" />
            {blocks}
          </g>
        ) : null}
        {L.cash > 0 ? (
          <g className="fm-lv d2">
            <rect x="0" y={yC} width={W} height={yA - yC} className="fm-cash" />
            <line x1="0" x2={W} y1={yC + 0.75} y2={yC + 0.75} className="fm-surface" />
          </g>
        ) : null}
      </g>,
    );
    if (L.cash >= 44) {
      parts.push(
        <g key="cash-t">
          <text className="t-mist" x={xl((yC + yA) / 2) + 28} y={(yC + yA) / 2 + 4}>
            Cash
          </text>
          <text className="t-num" x={xl((yC + yA) / 2) + 28} y={(yC + yA) / 2 + 24}>
            {zec(p.cash_zat)}
          </text>
          <text className="t-mist opt" x={xr((yC + yA) / 2) - 28} y={(yC + yA) / 2 + 4} textAnchor="end">
            pays withdrawals
          </text>
        </g>,
      );
    } else if (L.cash > 0) right.push({ y: yC + (yA - yC) / 2, cls: "t-ink", lines: [["t-ink", "cash"], ["t-head-mono", zec(p.cash_zat)]] });
    if (L.open >= 30) {
      parts.push(
        <text key="open-t" className="t-num" x={xl(yO) + 12} y={yO - 8}>
          {`${p.open} advance${p.open === 1 ? "" : "s"} out · ${zec(p.open_zat)}`}
        </text>,
      );
    } else if (L.open > 0) right.push({ y: yA + (yO - yA) / 2, cls: "t-ink", lines: [["t-ink", `${p.open} out`], ["t-head-mono", zec(p.open_zat)]] });
    if (L.overdue > 0) right.push({ y: yO + 4, cls: "t-ink", lines: [["t-ink", "overdue"], ["t-head-mono opt", `${p.overdue} · ${zec(p.overdue_zat)}`]] });
    else if (p.overdue > 0) right.push({ y: yO + 4, cls: "t-ink", lines: [["t-ink", `${p.overdue} overdue`], ["t-head-mono opt", "counted 0 until repaid"]] });
    if (p.repaid > 0) right.push({ y: yC, cls: "t-ink", lines: [["t-ink", `${p.repaid} repaid`], ["t-head-mono opt", "back as cash"]] });
    // the repayments came back as cash: settled ripples on the surface
    const rings = Math.min(p.repaid, 10);
    for (let i = 0; i < rings && L.cash > 0; i++) {
      parts.push(<ellipse key={`r${i}`} className={`fm-ring r${i}`} cx={330 + (i - rings / 2) * 34} cy={yC} rx={10 + (i % 2) * 4} ry="3.2" />);
    }
    if (L.owed !== null && owed !== null) {
      const yL = FLOOR - L.owed;
      const a = xl(yL) + 2;
      const b = xr(yL) - 2;
      const m = a + (b - a) * L.share;
      const over = yL < yC - 0.5;
      parts.push(
        <g className="fm-owe-g" key="owe">
          <line className={`fm-owe${over ? " is-over" : ""}`} x1={a} x2={b} y1={yL} y2={yL} />
          {L.share > 0 ? <line className="fm-mine" x1={a} x2={Math.max(a + 2, m)} y1={yL} y2={yL} /> : null}
          <text className="t-mist" x={a + 6} y={yL + 20}>
            {under === mine ? `your ${units(mine)} units` : `your ${units(mine)} units (${units(under)} under this root)`}
          </text>
        </g>,
      );
      right.push({ y: yL, cls: over ? "t-seal" : "t-head", lines: [[over ? "t-seal" : "t-head", "owed to"], [over ? "t-seal" : "t-head", "members"], ["t-head-mono", zec(owed)]] });
      desc += ` Owed to members at par: ${zec(owed)}, ${over ? "above" : "at or below"} the water line${assets !== null ? ` of ${zec(assets)}` : ""}.`;
    }
  } else {
    desc += p ? "The fund holds nothing in this period." : empty;
  }
  // labels on the ground beside the pool, kept apart
  right.sort((x, y) => x.y - y.y);
  let last = -Infinity;
  for (const r of right) {
    r.y = Math.max(r.y, last);
    last = r.y + r.lines.length * 19 + 10;
  }

  return (
    <svg className="fm-basin" viewBox={`0 0 ${W} 430`} role="img" aria-labelledby="fm-basin-d" ref={svg}>
      <desc id="fm-basin-d">{desc}</desc>
      <defs>
        <clipPath id="fm-bc">
          <polygon points={band(FLOOR, TOP)} />
        </clipPath>
        <pattern id="fm-earth" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" className="fm-earth" />
        </pattern>
        <pattern id="fm-silt" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
          <rect width="6" height="6" className="fm-silt-bg" />
          <line x1="0" y1="0" x2="0" y2="6" className="fm-silt-fg" />
        </pattern>
      </defs>
      {/* the ground the pool is cut into (section hatching) */}
      <polygon points={`0,${TOP} ${X0T},${TOP} ${X0B},${FLOOR} ${X1B},${FLOOR} ${X1T},${TOP} ${W},${TOP} ${W},${FLOOR + 26} 0,${FLOOR + 26}`} fill="url(#fm-earth)" />
      <line x1="0" y1={TOP} x2={X0T} y2={TOP} className="fm-ground" />
      <line x1={X1T} y1={TOP} x2={W} y2={TOP} className="fm-ground" />
      {/* the pool itself: Cetacean, the only dark object on the page */}
      <polygon points={band(FLOOR, TOP)} className="fm-pool" />
      {parts}
      {right.map((r, i) => (
        <g key={`l${i}`}>
          <line x1={X1T - 6} x2={X1T + 14} y1={r.y} y2={r.y} className="fm-leader" />
          {r.lines.map(([cls, t], j) => (
            <text key={j} className={cls} x={X1T + 18} y={r.y + 4 + j * 17}>
              {t}
            </text>
          ))}
        </g>
      ))}
      {!p || !L || L.empty ? (
        <>
          <text className="t-mist" x={W / 2} y={(TOP + FLOOR) / 2 - 6} textAnchor="middle">
            {p ? "The fund holds nothing in this period" : empty}
          </text>
          <text className="t-num" x={W / 2} y={(TOP + FLOOR) / 2 + 18} textAnchor="middle">
            {/* short enough to stay inside the pool at its narrowest (audit 2026-10-27, finding 16) */}
            {p ? "no cash, no advances out" : "shown after the first close"}
          </text>
        </>
      ) : null}
      <line x1={X0B} y1={FLOOR} x2={X1B} y2={FLOOR} className="fm-ground" />
      <text className="t-ink opt" x={(X0T + X1T) / 2} y={FLOOR + 46} textAnchor="middle">
        a section through the fund's shielded pool · levels drawn to scale
      </text>
    </svg>
  );
}
