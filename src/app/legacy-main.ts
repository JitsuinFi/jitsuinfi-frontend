// The app world before HNK-31: page builders that still return DOM (helper `h()`), mounted in the
// React shell by `Legacy` until each page moves to a component (HNK-31.T3 – T11). Imported once,
// in this order, so the stylesheets cascade as they did in app.html.
import "../style.css";
import "../pages/lobby.css";
import { type Role } from "../lib/account";
import { account } from "../lib/app-session";
import { accountPage, onboardingPending } from "../pages/account";
import { applyPage } from "../pages/apply";
import { buyerPage } from "../pages/buyer";
import { financierPage } from "../pages/financier";
import { memberPage } from "../pages/member";
import { supplierPage } from "../pages/supplier";
// try and verify are components now; their stylesheets stay here, in their old place in the
// cascade (the verify page uses try.css too)
import "../pages/try.css";
import "../pages/verify.css";


// Role pages open only in a session of that role; otherwise the account page asks to sign in.
const ROLE_PAGES: Record<string, { role: Role; page: () => HTMLElement }> = {
  "/supplier": { role: "supplier", page: supplierPage },
  "/buyer": { role: "buyer", page: buyerPage },
  "/member": { role: "member", page: memberPage },
};

// The financier console moves to the financier's own node (P-11, HNK-26). Until then this
// simulation stays reachable by address only, not in the navigation.
const HIDDEN: Record<string, () => HTMLElement> = { "/financier": financierPage, "/apply": applyPage };

/** The page at a clean path (HNK-31): the rate index is /rates; the lobby is a component (Lobby). */
export function pageFor(path: string): HTMLElement {
  if (path === "/account") return accountPage();
  const rp = ROLE_PAGES[path];
  if (rp) return account.current?.role === rp.role && !onboardingPending() ? rp.page() : accountPage(rp.role);
  const hidden = HIDDEN[path];
  if (hidden) return hidden();
  throw new Error(`no page at ${path}`);
}
