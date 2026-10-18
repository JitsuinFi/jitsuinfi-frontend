import "./style.css";
import { loadWasm } from "./lib/core";
import { h } from "./lib/ui";
import { buyerPage } from "./pages/buyer";
import { financierPage } from "./pages/financier";
import { outsiderPage } from "./pages/outsider";
import { supplierPage } from "./pages/supplier";
import { verifyPage } from "./pages/verify";

const ROUTES: Record<string, { label: string; page: () => HTMLElement }> = {
  "/supplier": { label: "Supplier", page: supplierPage },
  "/buyer": { label: "Buyer", page: buyerPage },
  "/financier": { label: "Financier", page: financierPage },
  "/verify": { label: "Verify", page: verifyPage },
  "/outsider": { label: "What outsiders see", page: outsiderPage },
};

function home(): HTMLElement {
  const tiles: Array<[string, string, string]> = [
    ["/supplier", "Supplier", "Issue an invoice and get it financed once."],
    ["/buyer", "Buyer", "Sign, acknowledge and pay with keys from your passkey."],
    ["/financier", "Financier", "Check the board and the buyer's full history."],
    ["/verify", "Verify", "Check a deal or catch a double financing."],
    ["/outsider", "What outsiders see", "Hashes only. Nothing about the parties."],
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
    h("div", { class: "grid" }, ...tiles.map(([href, title, text]) => h("a", { class: "tile", href: `#${href}` }, h("strong", {}, title), h("span", {}, text)))),
  );
}

function render(): void {
  const path = location.hash.replace(/^#/, "") || "/";
  const route = ROUTES[path];
  const nav = h(
    "nav",
    {},
    ...Object.entries(ROUTES).map(([href, r]) => h("a", { href: `#${href}`, class: href === path ? "active" : undefined }, r.label)),
  );
  const top = h(
    "header",
    { class: "top" },
    h("a", { class: "brand", href: "#/" }, h("img", { src: "/seal.svg", alt: "" }), "JitsuinFi"),
    nav,
    h("span", { class: "net" }, "Testnet"),
  );
  const main = h("main", {}, route ? route.page() : home());
  const foot = h("footer", {}, "Runs entirely in your browser. No trackers, no third-party requests.");
  document.getElementById("app")!.replaceChildren(top, main, foot);
  window.scrollTo(0, 0);
}

loadWasm()
  .then(() => {
    window.addEventListener("hashchange", render);
    render();
  })
  .catch((e) => {
    document.getElementById("app")!.replaceChildren(h("main", {}, h("h1", {}, "Could not load"), h("p", {}, String(e))));
  });
