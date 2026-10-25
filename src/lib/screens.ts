// The app's screens nav (HNK-31 shell; nav audit 2026-10-25): every screen on a desktop, and on a
// phone five tabs that fit a 390 px screen: Home, Try, Verify, then your role and Account when
// signed in, or What outsiders see and Sign in when not. The rate index (and, signed in, what
// outsiders see) stays one tap away in the lobby's directory. Pure: tests run it under Node.
import { roleLabel, type Role } from "./account.ts";

export interface Screen {
  to: string;
  /** The desktop label. */
  label: string;
  /** The phone tab's label. */
  short: string;
  /** Place in the phone tab bar, 1 to 5; null: desktop only. */
  phone: number | null;
}

const SHORT: Record<Role, string> = { supplier: "Supplier", buyer: "Buyer", member: "Fund" };

/** Every screen, in the desktop nav's order. */
export function screens(role: Role | null): Screen[] {
  const out: Screen[] = [{ to: "/app", label: "Home", short: "Home", phone: 1 }];
  if (role) out.push({ to: `/${role}`, label: roleLabel(role), short: SHORT[role], phone: 4 });
  out.push(
    { to: "/try", label: "Try it", short: "Try", phone: 2 },
    { to: "/verify", label: "Verify", short: "Verify", phone: 3 },
    { to: "/outsider", label: "What outsiders see", short: "Outsiders", phone: role ? null : 4 },
    { to: "/rates", label: "Rate index", short: "Rates", phone: null },
    { to: "/account", label: role ? "Account" : "Sign in", short: role ? "Account" : "Sign in", phone: 5 },
  );
  return out;
}

/** The phone tab bar: five screens, in tab order. */
export function phoneTabs(role: Role | null): Screen[] {
  return screens(role)
    .filter((s) => s.phone !== null)
    .sort((a, b) => a.phone! - b.phone!);
}
