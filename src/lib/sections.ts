// The app's information architecture (IA port, approved prototype design-samples/ia/prototype.html,
// 2026-10-26). Signed out, the nav is Home · Try it · Verify · Sign in; What outsiders see and the
// rate index stay one row away in the lobby and in each public page's Next room. Signed in, the nav
// is Home, then the role's own sections, then the inbox bell and the Account button (in the top
// bar on a phone too). After sign-in the app opens the role's first section.
// On a phone the bottom tab bar holds the role's sections and the Inbox (at most five tabs); Home
// is the logo. Pure: tests run it under Node.
//
// Part 1 of the port moved the supplier into sections; part 2 gives the buyer (Invoices · Pay ·
// History · Contacts) and the fund member (Fund · Units · Contacts) theirs, and every role's inbox
// lives in the shell's panel. The buyer's Pay carries a count when an invoice is due within a
// week or past due (buyer-late.ts payBadge).
import type { Role } from "./account.ts";

export interface Section {
  to: string;
  /** The nav's label. */
  label: string;
  /** The phone tab's label (short enough for five tabs on 390 px). */
  short: string;
  /** The tab's kanji. */
  k: string;
  /** The section carries a count: "due", the buyer's invoices due within a week or past due. */
  badge?: "due";
}

export const SECTIONS: Record<Role, readonly Section[]> = {
  supplier: [
    { to: "/supplier/invoices", label: "Invoices", short: "Invoices", k: "帳" },
    { to: "/supplier/invoices/new", label: "Write an invoice", short: "Write", k: "新" },
    { to: "/supplier/deal", label: "Deal", short: "Deal", k: "請" },
    { to: "/supplier/contacts", label: "Contacts", short: "Contacts", k: "名" },
  ],
  buyer: [
    { to: "/buyer/invoices", label: "Invoices", short: "Invoices", k: "帳" },
    { to: "/buyer/pay", label: "Pay", short: "Pay", k: "払", badge: "due" },
    { to: "/buyer/history", label: "History", short: "History", k: "歴" },
    { to: "/buyer/contacts", label: "Contacts", short: "Contacts", k: "名" },
  ],
  member: [
    { to: "/member/fund", label: "Fund", short: "Fund", k: "資" },
    { to: "/member/units", label: "Units", short: "Units", k: "受" },
    { to: "/member/contacts", label: "Contacts", short: "Contacts", k: "名" },
  ],
};

/** The roles whose inbox lives in the shell's panel: every role since part 2. */
export const INBOX_ROLES: readonly Role[] = ["supplier", "buyer", "member"];

export function hasInbox(role: Role | null): boolean {
  return role !== null && INBOX_ROLES.includes(role);
}

/** Where the app lands after sign-in, a role switch, or the role's row in the lobby. */
export function firstSection(role: Role): string {
  return SECTIONS[role][0].to;
}

export interface NavItem {
  to: string;
  label: string;
  short: string;
  k: string;
  badge?: "due";
}

const HOME: NavItem = { to: "/app", label: "Home", short: "Home", k: "登" };

/** Signed out: the four doors. /outsider and /rates are reached from the lobby and Next room. */
export const PUBLIC_NAV: readonly NavItem[] = [
  HOME,
  { to: "/try", label: "Try it", short: "Try", k: "試" },
  { to: "/verify", label: "Verify", short: "Verify", k: "証" },
  { to: "/account", label: "Sign in", short: "Sign in", k: "印" },
];

/** The desktop nav: the four doors, or Home and the role's sections. */
export function navItems(role: Role | null): NavItem[] {
  return role ? [HOME, ...SECTIONS[role]] : [...PUBLIC_NAV];
}

export type Tab = NavItem | { inbox: true; label: string; short: string; k: string };

/** The phone tab bar: the role's sections and the Inbox (at most five), or the four doors. */
export function phoneTabs(role: Role | null): Tab[] {
  if (!role) return [...PUBLIC_NAV];
  const tabs: Tab[] = [...SECTIONS[role]];
  if (hasInbox(role)) tabs.push({ inbox: true, label: "Inbox", short: "Inbox", k: "信" });
  if (tabs.length > 5) throw new Error(`${role}: more than five tabs`);
  return tabs;
}

/**
 * The nav item `path` belongs to: the longest section path that is `path` or a parent of it, so
 * /supplier/deal/x lights Deal and /supplier/invoices/new lights Write an invoice, not Invoices.
 */
export function activeItem(items: ReadonlyArray<{ to: string }>, path: string): string | null {
  const p = path.replace(/\/+$/, "") || "/";
  let best: string | null = null;
  for (const it of items) {
    if (p === it.to || (it.to !== "/app" && p.startsWith(it.to + "/"))) {
      if (!best || it.to.length > best.length) best = it.to;
    }
  }
  return best;
}
