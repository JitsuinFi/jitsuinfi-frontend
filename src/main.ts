import "./style.css";
import { roleLabel, type Role } from "./lib/account";
import { account } from "./lib/app-session";
import { loadWasm } from "./lib/core";
import { h } from "./lib/ui";
import { accountPage, onboardingPending } from "./pages/account";
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
const HIDDEN: Record<string, () => HTMLElement> = { "/financier": financierPage };

function home(): HTMLElement {
  // Each screen wears a seal badge, as the roles on the sign-in sheet: 売 sell, 買 buy, 資 fund,
  // 証 prove, 外 outside, 価 price, 試 try.
  const tiles: Array<[string, string, string, string]> = [
    ["/try", "試", "Try to double-finance", "Sell one invoice twice and watch it fail. No wallet needed."],
    ["/supplier", "売", "Supplier", "Issue an invoice and get it financed once."],
    ["/buyer", "買", "Buyer", "Sign, acknowledge and pay with keys from your passkey."],
    ["/member", "資", "Fund member", "See what the fund holds for you."],
    ["/verify", "証", "Verify", "Check a deal or catch a double financing."],
    ["/outsider", "外", "What outsiders see", "Codes and hashes. Nothing about the parties."],
    ["/index", "価", "Rate index", "Market prices from the board, no parties."],
  ];
  return h(
    "div",
    {},
    h("h1", {}, "Zcash stops double-spending. JitsuinFi stops double-financing."),
    h(
      "p",
      { class: "lead" },
      "Private invoice financing on Zcash: every invoice gets a fingerprint on a public board, so a supplier cannot finance it twice, while amounts, parties and documents stay shielded.",
    ),
    h(
      "div",
      { class: "grid" },
      ...tiles.map(([href, kanji, title, text]) =>
        h("a", { class: "tile", href: `#${href}` }, h("span", { class: "badge", "aria-hidden": "true" }, kanji), h("strong", {}, title), h("span", {}, text)),
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
  const main = h("main", {}, pageFor(path));
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
