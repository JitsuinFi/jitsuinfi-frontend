// /app/contact#<card> (judge run 2, finding 5): a contact link opened in the app. The card is in
// the fragment, so it never reached a server; it is read here, checked as a pasted card is, and
// added in one confirm (ContactAdd.tsx). Signed out, the sign-in shows first (the role the card's
// counterparty usually has is chosen), then this screen comes back with the card still here.
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Page } from "../app/AppShell";
import { account } from "../lib/app-session";
import { contactName, readContact, type Contact } from "../lib/contact";
import { asSentence, explain } from "../lib/explain";
import type { Role } from "../lib/account";
import { firstSection } from "../lib/sections";
import { AccountPage, onboardingPending, useSessionGate } from "./AccountPage";
import { AddContact, keepContact } from "./ContactAdd";
import "./contacts.css";

// the card read from the link, kept in memory while the person signs in (never stored)
let held: { hash: string; c: Contact | null; error: string | null } | null = null;
// the held card was added from the sign-up's Ready step (mobile E2E 2026-10-27, B-04 → B-06)
let addedAtSignUp: Contact | null = null;

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

/** Why the link does not open, in whole sentences, and what to do (audit 2026-10-27, finding 11). */
function linkProblem(hash: string, error: string | null): string {
  const why = hash ? asSentence(explain(error ?? "")) : "This link has no contact card in it.";
  return /ask them/i.test(why) ? `${why} Or paste it on Contacts.` : `${why} Ask them to share their contact card again, or paste it on Contacts.`;
}

/** The role the person opening a card usually has: a supplier's card goes to a buyer, and back. */
const counterpart = (r: Contact["role"]): Role | undefined => (r === "supplier" ? "buyer" : r === "buyer" ? "supplier" : undefined);

export function ContactLinkPage(): ReactNode {
  useSessionGate();
  const hash = useRouterState({ select: (r) => r.location.hash });
  const [{ c, error }] = useState(() => read(hash));
  const [dismissed, setDismissed] = useState(false);
  const s = account.current;
  if (c && (!s || onboardingPending()))
    return (
      <AccountPage
        want={counterpart(c.role)}
        shared={{
          name: contactName(c),
          add: async () => {
            await keepContact(c);
            addedAtSignUp = c;
          },
        }}
      />
    );
  const home = s ? firstSection(s.role) : "/app";
  return (
    <Page wide>
      <div className="ia-ct ia-link-page" data-wide="true">
        <p className="sp-tag">
          <b lang="ja">名</b>Contact link
        </p>
        <h1>{c ? `${contactName(c)} shared their contact` : "This contact link does not open"}</h1>
        {c && !dismissed ? (
          <AddContact c={c} onCancel={() => setDismissed(true)} fromLink added={addedAtSignUp === c} />
        ) : c ? (
          <p className="ia-ct-lede">Not added. Open the link again whenever you want to add them.</p>
        ) : (
          <p className="ia-ct-lede">{linkProblem(hash, error)}</p>
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
