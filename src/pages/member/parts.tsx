// The fund member's shared parts (HNK-34.T5, approved sample design-samples/internal/member.html;
// IA port part 2, 2026-10-26): the 資 tag with the section, a file field as a pill, and CSS
// variables written through the CSSOM (CSP-safe). Styles: pages/role-paper.css, pages/member.css.
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";

/** The tag above every member section's title: 資 Fund member · section. */
export function MemberTag({ k = "資", section }: { k?: string; section?: string }): ReactNode {
  return (
    <p className="rp-eyebrow">
      <span className="rp-stamp" lang="ja" aria-hidden="true">
        {k}
      </span>
      Fund member
      {section ? (
        <>
          <i className="ia-dot" aria-hidden="true">
            ·
          </i>
          <span className="ia-sec">{section}</span>
        </>
      ) : null}
    </p>
  );
}

/** CSS custom properties through the CSSOM (CSP-safe): `data-v="--name:value;…"` on any element under `root`. */
export function useVars(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement | SVGElement>("[data-v]").forEach((el) => {
      for (const pair of el.dataset.v!.split(";")) {
        const at = pair.indexOf(":");
        if (at > 0) el.style.setProperty(pair.slice(0, at), pair.slice(at + 1));
      }
    });
  });
}

/** A file field as a pill (the chosen file's name, and Choose). */
export function FilePill({ label, empty, inputRef }: { label: string; empty: string; inputRef: RefObject<HTMLInputElement | null> }): ReactNode {
  const [name, setName] = useState<string | null>(null);
  return (
    <label className="rp-file">
      <input type="file" aria-label={label} ref={inputRef} onChange={(e) => setName(e.currentTarget.files?.[0]?.name ?? null)} />
      <span>{name ?? empty}</span>
      <b aria-hidden="true">Choose</b>
    </label>
  );
}
