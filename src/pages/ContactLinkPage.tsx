// /app/contact#<card> (judge run 2, finding 5): a contact link opened in the app. The card is in
// the fragment, so it never reached a server; it is read here, checked as a pasted card is, and
// added in one confirm (ContactAdd.tsx). Signed out, the sign-in shows first (the role the card's
// counterparty usually has is chosen), then this screen comes back with the card still here.
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Page } from "../app/AppShell";
import { account } from "../lib/app-session";
import { readContact, type Contact } from "../lib/contact";
import { explain } from "../lib/explain";
import type { Role } from "../lib/account";
import { firstSection } from "../lib/sections";
import { AccountPage, onboardingPending, useSessionGate } from "./AccountPage";
import { AddContact } from "./ContactAdd";
import "./contacts.css";

// the card read from the link, kept in memory while the person signs in (never stored)
let held: { hash: string; c: Contact | null; error: string | null } | null = null;

function read(hash: string): { c: Contact | null; error: string | null } {
  if (held && (held.hash === hash || !hash)) return held;
  let c: Contact | null = null;
  let error: string | null = null;
  try {
    c = readContact(hash);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (hash) held = { hash, c, error };
  return { c, error };
}

/** The role the person opening a card usually has: a supplier's card goes to a buyer, and back. */
const counterpart = (r: Contact["role"]): Role | undefined => (r === "supplier" ? "buyer" : r === "buyer" ? "supplier" : undefined);

export function ContactLinkPage(): ReactNode {
  useSessionGate();
  const hash = useRouterState({ select: (r) => r.location.hash });
  const [{ c, error }] = useState(() => read(hash));
  const [dismissed, setDismissed] = useState(false);
  const s = account.current;
  if (c && (!s || onboardingPending())) return <AccountPage want={counterpart(c.role)} />;
  const home = s ? firstSection(s.role) : "/app";
  return (
    <Page wide>
      <div className="ia-ct ia-link-page" data-wide="true">
        <p className="sp-tag">
          <b lang="ja">名</b>Contact link
        </p>
        <h1>{c ? "Someone shared their contact" : "This contact link does not open"}</h1>
        {c && !dismissed ? (
          <AddContact c={c} onCancel={() => setDismissed(true)} fromLink />
        ) : c ? (
          <p className="ia-ct-lede">Not added. Open the link again whenever you want to add them.</p>
        ) : (
          <p className="ia-ct-lede">{`${explain(error ?? "")} Ask them to share their contact again, or paste it on Contacts.`}</p>
        )}
        {dismissed || !c ? (
          <p className="ia-goline">
            <Link className="sp-ink" to={s ? `/${s.role}/contacts` : "/app"}>
              {s ? "Your contacts" : "Home"}
            </Link>
            {s ? (
              <>
                {" · "}
                <Link className="sp-ink" to={home}>
                  Your counter
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </Page>
  );
}
