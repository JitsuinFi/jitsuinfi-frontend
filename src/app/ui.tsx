// The app's parts as React components (HNK-31): the same markup and class names as the DOM
// helpers of src/lib/ui.ts and src/pages/desk.ts had, so the stylesheets apply unchanged.
// No innerHTML and no parsed markup: the QR is drawn as React SVG from its modules (QrPlate.tsx).
import { useState, type ReactNode, type Ref } from "react";
import { explain, isRelayOutage } from "../lib/explain";
import { download } from "../lib/download";

// One part of a screen, set on the paper (D-36: no card box): its heading on the left, its fields
// and results on the right; stacked on narrow screens. The class name stays "card" for the pages.
export function Card({ step, title, hint, children, cardRef }: { step: string; title: string; hint: string; children?: ReactNode; cardRef?: Ref<HTMLElement> }): ReactNode {
  return (
    <section className="card" ref={cardRef}>
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
      {area ? <textarea key={value ?? ""} placeholder={placeholder} spellCheck="false" defaultValue={value} ref={inputRef} /> : <input key={value ?? ""} type={type ?? "text"} placeholder={placeholder} spellCheck="false" autoComplete="off" defaultValue={value} ref={inputRef} />}
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
      setContent(<Banner kind="bad" title={isRelayOutage(msg) ? "Relay not reachable" : "Refused"} text={said} detail={said !== msg ? msg : undefined} />);
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
