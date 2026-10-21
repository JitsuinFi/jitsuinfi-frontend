// The role and public pages on the 登記所 counter (HNK-30.T17, MASTER.md §8): one stage per page
// (the scene that says what the page is for), then the page's steps as documents laid on the
// counter top. A deal's route runs along the counter rail as stations, each a physical thing
// (the buyer's seal, the envelope to the financier, the registry, the letter, the advance);
// done stations are stamped 済, the next one sits under the lamp.
import { h } from "../lib/ui";
import "./try.css";
import "./desk.css";

export interface Station {
  glyph: string;
  label: string;
  state: "done" | "next" | "later";
}

/** The deal's route as stations on the counter rail. */
export function route(stations: Station[], caption?: string): HTMLElement {
  return h(
    "div",
    { class: "dr" },
    h(
      "ol",
      { class: "dr-rail", "aria-label": "Steps of this deal" },
      ...stations.map((s) =>
        h(
          "li",
          { class: `dr-st is-${s.state}` },
          h("span", { class: "dr-obj", lang: "ja", "aria-hidden": "true" }, s.glyph),
          h("span", { class: "dr-label" }, s.label),
          h("span", { class: "dr-state" }, s.state === "done" ? "done" : s.state === "next" ? "next" : "later"),
        ),
      ),
    ),
    caption ? h("p", { class: "dr-cap" }, caption) : null,
  );
}

/** A small static 請求書 for a stage: the open deal or invoice, read only. */
export function miniInvoice(o: { id: string; amount: string; due: string; n?: string; sealed: boolean; stamp?: string } | null): HTMLElement {
  if (!o) {
    return h(
      "article",
      { class: "mi is-blank", "aria-label": "No invoice open" },
      h("p", { class: "mi-t", lang: "ja" }, "請 求 書"),
      h("p", { class: "mi-blank" }, "No invoice open yet"),
      h("span", { class: "mi-seal", "aria-hidden": "true" }),
    );
  }
  return h(
    "article",
    { class: "mi", "aria-label": `Invoice ${o.id}` },
    h("p", { class: "mi-t", lang: "ja" }, "請 求 書"),
    h("p", { class: "mi-id" }, o.id),
    h("p", { class: "mi-amt" }, h("span", { lang: "ja" }, "ご請求金額"), o.amount),
    h("p", { class: "mi-due" }, `Due ${o.due}`),
    o.n ? h("p", { class: "mi-n" }, h("b", {}, "N"), `${o.n.slice(0, 12)}…${o.n.slice(-6)}`) : null,
    h("span", { class: `mi-seal${o.sealed ? " is-sealed" : ""}`, lang: "ja", "aria-label": o.sealed ? "Sealed by the buyer" : "Not sealed by the buyer yet" }, o.sealed ? "買" : ""),
    o.stamp ? h("span", { class: "mi-stamp", lang: "ja", "aria-hidden": "true" }, o.stamp) : null,
  );
}

/** A page on the counter: the head, the stage, then the documents on the counter top. */
export function deskPage(o: { glyph: string; eyebrow: string; title: string; lede: string; stage: HTMLElement; docs: HTMLElement[] }): HTMLElement {
  return h(
    "div",
    { class: "try desk-page", "data-wide": "true" },
    h("header", { class: "try-head" }, h("p", { class: "try-case" }, h("span", { lang: "ja" }, o.glyph), o.eyebrow), h("h1", {}, o.title), h("p", {}, o.lede)),
    o.stage,
    h("div", { class: "desk-docs" }, ...o.docs),
  );
}
