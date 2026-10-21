import "./style.css";
import "./pages/lobby.css";
import { roleLabel, type Role } from "./lib/account";
import { account } from "./lib/app-session";
import { loadWasm } from "./lib/core";
import { h } from "./lib/ui";
import { accountPage, onboardingPending } from "./pages/account";
import { applyPage } from "./pages/apply";
import { buyerPage } from "./pages/buyer";
import { financierPage } from "./pages/financier";
import { memberPage } from "./pages/member";
import { outsiderPage } from "./pages/outsider";
import { ratesPage } from "./pages/rates";
import { supplierPage } from "./pages/supplier";
import { tryPage } from "./pages/try";
import { verifyPage } from "./pages/verify";

// Public pages need no account (BL-PG-01).
const PUBLIC: Record<string, { label: string; page: () => HTMLElement }> = {
  "/try": { label: "Try it", page: tryPage },
  "/verify": { label: "Verify", page: verifyPage },
  "/outsider": { label: "What outsiders see", page: outsiderPage },
  "/index": { label: "Rate index", page: ratesPage },
};

// Role pages open only in a session of that role; otherwise the account page asks to sign in.
const ROLE_PAGES: Record<string, { role: Role; page: () => HTMLElement }> = {
  "/supplier": { role: "supplier", page: supplierPage },
  "/buyer": { role: "buyer", page: buyerPage },
  "/member": { role: "member", page: memberPage },
};

// The financier console moves to the financier's own node (P-11, HNK-26). Until then this
// simulation stays reachable by address only, not in the navigation.
const HIDDEN: Record<string, () => HTMLElement> = { "/financier": financierPage, "/apply": applyPage, "/try/play": () => tryPage(true) };

function home(): HTMLElement {
  // The 登記所 lobby (HNK-30.T15, MASTER.md §8): every screen is a counter behind a noren curtain
  // with its seal glyph: 試 try, 売 sell, 買 buy, 資 fund, 証 verify, 外 outside, 価 price. Role
  // counters hang plum noren (people and their documents), public counters navy (what anyone can
  // check). The curtain parts on hover; the counter opens on click.
  const doors: Array<[string, string, string, string, "role" | "public"]> = [
    ["/try", "試", "Try to double-finance", "Sell one invoice twice and watch it fail. No wallet needed.", "public"],
    ["/supplier", "売", "Supplier", "Issue an invoice and get it financed once.", "role"],
    ["/buyer", "買", "Buyer", "Sign, acknowledge and pay with keys from your passkey.", "role"],
    ["/member", "資", "Fund member", "See what the fund holds for you.", "role"],
    ["/verify", "証", "Verify", "Check a deal or catch a double financing.", "public"],
    ["/outsider", "外", "What outsiders see", "Codes and hashes. Nothing about the parties.", "public"],
    ["/index", "価", "Rate index", "Market prices from the board, no parties.", "public"],
  ];
  return h(
    "div",
    { class: "lobby", "data-wide": "true" },
    h(
      "header",
      { class: "lobby-head" },
      h("p", { class: "lobby-sign", lang: "ja" }, "登 記 所"),
      h("h1", {}, "Zcash stops double-spending. ", h("span", {}, "JitsuinFi stops double-financing.")),
      h("p", {}, "Every invoice leaves one fingerprint on a public board, so it is financed once; amounts, parties and documents stay shielded."),
      h("span", { class: "lobby-seal", "aria-hidden": "true", lang: "ja" }, h("b", {}, "実"), h("b", {}, "印")),
    ),
    h(
      "nav",
      { class: "lobby-doors", "aria-label": "Counters" },
      ...doors.map(([href, kanji, title, text, kind], i) =>
        h(
          "a",
          { class: `door is-${kind}${i === 0 ? " is-first" : ""}`, href: `#${href}` },
          h("span", { class: "door-way", "aria-hidden": "true" }, h("span", { class: "noren" }, h("i", {}), h("i", {}, h("b", { lang: "ja" }, kanji)), h("i", {}))),
          h("strong", {}, title),
          h("span", {}, text),
        ),
      ),
    ),
  );
}

function pageFor(path: string): HTMLElement {
  if (path === "/account") return accountPage();
  const rp = ROLE_PAGES[path];
  if (rp) return account.current?.role === rp.role && !onboardingPending() ? rp.page() : accountPage(rp.role);
  const pub = PUBLIC[path];
  if (pub) return pub.page();
  const hidden = HIDDEN[path];
  if (hidden) return hidden();
  return home();
}

function render(): void {
  const path = location.hash.replace(/^#/, "") || "/";
  const s = account.current;
  const link = (href: string, label: string) => h("a", { href: `#${href}`, class: href === path ? "active" : undefined }, label);
  const nav = h(
    "nav",
    { "aria-label": "Screens" },
    link("/", "Home"),
    s ? link(`/${s.role}`, roleLabel(s.role)) : null,
    ...Object.entries(PUBLIC).map(([href, r]) => link(href, r.label)),
    link("/account", s ? "Account" : "Sign in"),
  );
  const top = h(
    "header",
    { class: "top" },
    h("a", { class: "brand", href: "#/" }, h("img", { src: "/seal.svg", alt: "" }), "JitsuinFi"),
    nav,
    h("span", { class: "net" }, "Testnet"),
  );
  const body = pageFor(path);
  // A stage page (data-wide) takes the full width: its visuals need the room (HNK-30.T13, FE-M0 M3).
  const main = h("main", { class: body.dataset.wide ? "wide" : undefined }, body);
  const foot = h("footer", {}, "Runs entirely in your browser. No trackers, no third-party requests.");
  document.getElementById("app")!.replaceChildren(top, main, foot);
}

loadWasm()
  .then(() => {
    window.addEventListener("hashchange", () => {
      render();
      window.scrollTo(0, 0);
    });
    account.onChange(render);
    render();
  })
  .catch((e) => {
    document.getElementById("app")!.replaceChildren(h("main", {}, h("h1", {}, "Could not load"), h("p", {}, String(e))));
  });
