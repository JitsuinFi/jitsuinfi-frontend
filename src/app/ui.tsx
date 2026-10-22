// The app's parts as React components (HNK-31): the same markup and class names as the DOM
// helpers of src/lib/ui.ts and src/pages/desk.ts had, so the stylesheets apply unchanged.
// No innerHTML for user data; the only parsed markup is SVG drawn by our own wasm (TrustedSvg).
import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { explain } from "../lib/explain";
import { download } from "../lib/ui";
import { Page } from "./AppShell";

// One part of a screen, set on the paper (D-36: no card box): its heading on the left, its fields
// and results on the right; stacked on narrow screens. The class name stays "card" for the pages.
export function Card({ step, title, hint, children }: { step: string; title: string; hint: string; children?: ReactNode }): ReactNode {
  return (
    <section className="card">
      <div className="part-head">
        <div className="step">{step}</div>
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
      </div>
      <div className="part-body">{children}</div>
    </section>
  );
}

/** A labelled input or text area; uncontrolled, read through `inputRef`. */
export function Field({ label, type, placeholder, area, value, help, inputRef }: { label: string; type?: string; placeholder?: string; area?: boolean; value?: string; help?: string; inputRef?: Ref<HTMLInputElement & HTMLTextAreaElement> }): ReactNode {
  return (
    <label className="field">
      <span>{label}</span>
      {area ? <textarea placeholder={placeholder} spellCheck="false" defaultValue={value} ref={inputRef} /> : <input type={type ?? "text"} placeholder={placeholder} spellCheck="false" autoComplete="off" defaultValue={value} ref={inputRef} />}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

export function FileField({ label, help, inputRef }: { label: string; help?: string; inputRef?: Ref<HTMLInputElement> }): ReactNode {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="file" ref={inputRef} />
      {help ? <small>{help}</small> : null}
    </label>
  );
}

/** A button that stays disabled while its (async) action runs. */
export function Button({ onClick, secondary, children }: { onClick: () => void | Promise<void>; secondary?: boolean; children: ReactNode }): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={secondary ? "secondary" : undefined}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}

export function Actions({ children }: { children: ReactNode }): ReactNode {
  return <div className="actions">{children}</div>;
}

// The hanko pressed beside a verdict: 認 accepted, 待 waiting, 拒 refused. The words carry the
// meaning; the stamp and its ink colour only repeat it (never colour alone).
const HANKO = { ok: "認", warn: "待", bad: "拒" } as const;

/** `glyph` replaces the stamp for a named verdict, e.g. 偽 forged seal or 重 already pledged. */
export function Banner({ kind, title, text, glyph, detail }: { kind: "ok" | "warn" | "bad"; title: string; text: ReactNode; glyph?: string; detail?: string }): ReactNode {
  return (
    <div className={`banner ${kind}`} role={kind === "bad" ? "alert" : "status"}>
      <span className="hanko" aria-hidden="true">
        {glyph ?? HANKO[kind]}
      </span>
      <strong>{title}</strong>
      <span>{text}</span>
      {detail ? <small className="banner-detail">{detail}</small> : null}
    </div>
  );
}

/** A slot that shows either a result or an error, replacing its previous content. */
export interface OutSlot {
  el: ReactNode;
  show(content: ReactNode): void;
  error(e: unknown): void;
  clear(): void;
}

export function useOut(): OutSlot {
  const [content, setContent] = useState<ReactNode>(null);
  return {
    el: <div className="out">{content}</div>,
    show: setContent,
    clear: () => setContent(null),
    error(e) {
      const msg = e instanceof Error ? e.message : String(e);
      // HNK-21.T9: what happened in a sentence; the crate's own words stay for support
      const said = explain(msg);
      setContent(<Banner kind="bad" title="Refused" text={said} detail={said !== msg ? msg : undefined} />);
    },
  };
}

export function CodeBlock({ label, value, filename }: { label: string; value: string; filename?: string }): ReactNode {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="copyrow">
        <div className="code">{value}</div>
        <div className="actions">
          <Button secondary onClick={async () => void (await navigator.clipboard.writeText(value))}>
            Copy
          </Button>
          {filename ? (
            <Button secondary onClick={() => download(filename, value)}>
              Download
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Kv({ rows }: { rows: Array<[string, string, boolean?]> }): ReactNode {
  return (
    <table className="kv">
      <tbody>
        {rows.map(([k, v, mono], i) => (
          <tr key={i}>
            <td>{k}</td>
            <td className={mono ? "mono" : undefined}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** SVG produced by our own wasm (the QR renderer), never user-provided markup. */
export function TrustedSvg({ svg }: { svg: string }): ReactNode {
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    wrap.current!.replaceChildren(...(root.nodeName.toLowerCase() === "svg" ? [document.importNode(root, true)] : []));
  }, [svg]);
  return <div className="qr" ref={wrap} />;
}

// ---------- the counter (HNK-30.T17, MASTER.md §8) ----------
// The role and public pages on the 登記所 counter: one stage per page (the scene that says what
// the page is for), then the page's steps as documents laid on the counter top. A deal's route
// runs along the counter rail as stations, each a physical thing (the buyer's seal, the envelope
// to the financier, the registry, the letter, the advance); done stations are stamped 済, the next
// one sits under the lamp. Styles: pages/try.css and pages/desk.css, in the app shell's cascade.

export interface Station {
  glyph: string;
  label: string;
  state: "done" | "next" | "later";
}

/** The deal's route as stations on the counter rail. */
export function Route({ stations, caption }: { stations: Station[]; caption?: string }): ReactNode {
  return (
    <div className="dr">
      <ol className="dr-rail" aria-label="Steps of this deal">
        {stations.map((s, i) => (
          <li key={i} className={`dr-st is-${s.state}`}>
            <span className="dr-obj" lang="ja" aria-hidden="true">
              {s.glyph}
            </span>
            <span className="dr-label">{s.label}</span>
            <span className="dr-state">{s.state === "done" ? "done" : s.state === "next" ? "next" : "later"}</span>
          </li>
        ))}
      </ol>
      {caption ? <p className="dr-cap">{caption}</p> : null}
    </div>
  );
}

/** A small static 請求書 for a stage: the open deal or invoice, read only. */
export function MiniInvoice({ o }: { o: { id: string; amount: string; due: string; n?: string; sealed: boolean; stamp?: string } | null }): ReactNode {
  if (!o) {
    return (
      <article className="mi is-blank" aria-label="No invoice open">
        <p className="mi-t" lang="ja">
          請 求 書
        </p>
        <p className="mi-blank">No invoice open yet</p>
        <span className="mi-seal" aria-hidden="true" />
      </article>
    );
  }
  return (
    <article className="mi" aria-label={`Invoice ${o.id}`}>
      <p className="mi-t" lang="ja">
        請 求 書
      </p>
      <p className="mi-id">{o.id}</p>
      <p className="mi-amt">
        <span lang="ja">ご請求金額</span>
        {o.amount}
      </p>
      <p className="mi-due">{`Due ${o.due}`}</p>
      {o.n ? (
        <p className="mi-n">
          <b>N</b>
          {`${o.n.slice(0, 12)}…${o.n.slice(-6)}`}
        </p>
      ) : null}
      <span className={`mi-seal${o.sealed ? " is-sealed" : ""}`} lang="ja" aria-label={o.sealed ? "Sealed by the buyer" : "Not sealed by the buyer yet"}>
        {o.sealed ? "買" : ""}
      </span>
      {o.stamp ? (
        <span className="mi-stamp" lang="ja" aria-hidden="true">
          {o.stamp}
        </span>
      ) : null}
    </article>
  );
}

/**
 * A page on the counter: the head, the stage, then the documents on the counter top. `wrapped`:
 * inside one more full-width box, as the role pages that redraw themselves had it.
 */
export function DeskPage({ glyph, eyebrow, title, lede, stage, children, wrapped }: { glyph: string; eyebrow: string; title: string; lede: string; stage: ReactNode; children: ReactNode; wrapped?: boolean }): ReactNode {
  const page = (
    <div className="try desk-page" data-wide="true">
      <header className="try-head">
        <p className="try-case">
          <span lang="ja">{glyph}</span>
          {eyebrow}
        </p>
        <h1>{title}</h1>
        <p>{lede}</p>
      </header>
      {stage}
      <div className="desk-docs">{children}</div>
    </div>
  );
  return <Page wide>{wrapped ? <div data-wide="true">{page}</div> : page}</Page>;
}
