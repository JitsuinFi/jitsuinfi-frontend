// What the board does not stop (N-13), posted as the registry's official notice 告示 on the wall
// beside the counter: one document, three clauses cited the way a notice cites them, the
// registry's square seal at the foot.
import type { ReactNode } from "react";

const CLAUSES: Array<[string, string]> = [
  ["第一", "A fake invoice that the buyer itself co-signs. The buyer's signature is real, so the board sees a new invoice."],
  ["第二", "One delivery split into two invoices that the buyer both signs."],
  ["第三", "A financier that does not check the board before paying."],
];

export function Notice(): ReactNode {
  return (
    <article className="nt" aria-label="Notice: what this does not stop">
      <span className="nt-pin is-l" aria-hidden="true" />
      <span className="nt-pin is-r" aria-hidden="true" />
      <p className="nt-head" lang="ja">
        告 示
      </p>
      <h2>What the board does not stop</h2>
      <p className="nt-lede">The board stops one signed invoice from being financed twice. It is not credit diligence.</p>
      <ol>
        {CLAUSES.map(([no, text]) => (
          <li key={no}>
            <span className="nt-no" lang="ja">
              {no}
            </span>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <span className="nt-seal" aria-hidden="true" lang="ja">
        登記
        <br />
        所印
      </span>
    </article>
  );
}
