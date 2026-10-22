// Role pages open only in a session of that role; otherwise the account page asks to sign in
// (BL-PG-01), and right after sign-up it keeps showing the onboarding sheet.
import type { ReactNode } from "react";
import type { Role } from "../lib/account";
import { account } from "../lib/app-session";
import { AccountPage, onboardingPending, useSessionGate } from "../pages/AccountPage";

export function RoleGate({ role, children }: { role: Role; children: ReactNode }): ReactNode {
  useSessionGate();
  return account.current?.role === role && !onboardingPending() ? children : <AccountPage want={role} />;
}
