// The inbox panel (IA port, approved prototype design-samples/ia/prototype.html, 2026-10-26): the
// bell opens it as a slide-over on the right, the phone's Inbox tab as a full-height sheet. The
// mailbox's state, Check inbox, and the letters as envelopes, each with its readable name and its
// real action inline. Acting stamps 済 on the envelope, closes the panel and opens the page the
// action leads to, with the outcome there ("Done · from your inbox"); a small action that needs no
// page completes here. A letter whose seal does not hold, or that this role has nothing to do
// with, is shown and left alone, as the mailbox did. Styles: src/app/shell.css (.ia-inbox).
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Role } from "../lib/account";
import { explain } from "../lib/explain";
import { letterAction, letterGlyph, letterLabel } from "../lib/inbox-routes";
import { SECTIONS } from "../lib/sections";
import { reducedMotion } from "../landing/motion";
import { act, actionable, checkInbox, letGo, snapshot, subscribe, unread, type Letter } from "./inbox";
import { LongList } from "./LongList";
import { setDid } from "./outcome";

export function useInbox() {
  return useSyncExternalStore(subscribe, snapshot);
}

const when = (iso: string) => new Date(iso).toLocaleString();

function LetterRow({ l, role, onLead, leaving }: { l: Letter; role: Role; onLead: (l: Letter) => void; leaving: boolean }): ReactNode {
  const s = useInbox();
  const t = l.r.message.header.type;
  const a = letterAction(role, t);
  const can = actionable(l, s.handlers) && a !== null;
  const done = l.state === "done";
  const cls = ["ia-letter", l.fresh && !done ? "is-new" : "", done ? "is-done" : "", leaving ? "is-leaving" : "", !l.r.signatureOk ? "is-forged" : "", !can && l.r.signatureOk ? "is-idle" : ""].filter(Boolean).join(" ");
  return (
    <article className={cls} data-type={t}>
      <span className="ia-env" lang="ja" aria-hidden="true">
        {done ? "済" : !l.r.signatureOk ? "偽" : letterGlyph(t)}
      </span>
      <div>
        <strong>{letterLabel(t, role, l.r.message.header.body)}</strong>
        <span className="ia-from">{`from a ${l.r.message.header.from.role} · ${when(l.r.receivedAt)}`}</span>
        {!l.r.signatureOk ? (
          <p>The seal on this letter does not hold: it was changed on the way or forged. It is ignored.</p>
        ) : done ? (
          <p role="status">{l.said}</p>
        ) : l.about ? (
          <p>{l.about}</p>
        ) : null}
        {l.r.signatureOk && !done ? (
          can ? (
            <div className="ia-acts">
              <button type="button" disabled={l.state === "busy"} onClick={() => onLead(l)}>
                {l.state === "busy" ? "Working…" : a.label}
              </button>
              <span className="ia-goes">{a.goes}</span>
            </div>
          ) : (
            <small className="ia-idle">Nothing to do with this letter here.</small>
          )
        ) : null}
        {done && leaving ? <small className="ia-goes">Opening it…</small> : null}
        {l.state === "failed" && l.error ? (
          <p className="ia-refused" role="alert">
            <b lang="ja" aria-hidden="true">
              拒
            </b>
            <span>{explain(l.error)}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function InboxPanel({ open, onClose, onLeave }: { open: boolean; onClose: () => void; onLeave: (href: string) => void }): ReactNode {
  const s = useInbox();
  const panel = useRef<HTMLElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const role = s.role;

  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closer.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // focus stays in the open panel (a dialog)
      if (e.key === "Tab" && panel.current) {
        const f = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (back && document.contains(back)) back.focus();
    };
  }, [open, onClose]);

  const lead = async (l: Letter) => {
    const done = await act(l);
    if (!done) return;
    if (!done.to) {
      // completed here: the 済 stays on the envelope a moment, then the letter goes
      setTimeout(() => letGo(l), reducedMotion() ? 2400 : 4000);
      return;
    }
    const to = done.to;
    const go = () => {
      setLeaving(null);
      letGo(l);
      if (done.did) setDid({ ...done.did, at: to.path, inbox: true });
      onLeave(to.at ? `${to.path}?at=${to.at}` : to.path);
    };
    if (reducedMotion()) return go();
    setTimeout(() => setLeaving(l.r.relayId), 650);
    setTimeout(go, 1000);
  };

  const n = unread(s);
  const contacts = role ? SECTIONS[role].find((x) => x.to.endsWith("/contacts")) : undefined;
  return (
    <>
      <div className={open ? "ia-scrim is-on" : "ia-scrim"} onClick={onClose} aria-hidden="true" />
      <aside className={open ? "ia-inbox is-open" : "ia-inbox"} role="dialog" aria-modal="true" aria-labelledby="ib-h" aria-hidden={!open} inert={!open} ref={panel}>
        <div className="ia-ib-grab" aria-hidden="true" />
        <header className="ia-ib-head">
          <div className="ia-ib-title">
            <b lang="ja" aria-hidden="true">
              信
            </b>
            <h2 id="ib-h">
              Inbox <small lang="ja">受信箱</small>
            </h2>
            <span className={n ? "ia-ib-n" : "ia-ib-n is-none"}>{n ? `${n} new` : "nothing new"}</span>
            <button type="button" className="ia-x" aria-label="Close the inbox" onClick={onClose} ref={closer}>
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
          {s.mailbox === "unreachable" ? (
            <p className="ia-ib-state is-off">
              <b>Mailbox not reachable.</b> {`${explain(s.why ?? "")} Your documents stay on this device; try again later.`}
            </p>
          ) : s.mailbox === "ready" ? (
            <p className="ia-ib-state">
              <b>Mailbox ready.</b> Counterparties with your contact card can send you documents. Only you can open them.
            </p>
          ) : (
            <p className="ia-ib-state is-wait">Opening your mailbox…</p>
          )}
          <div className="ia-ib-check">
            <button type="button" className="secondary" disabled={s.checking || s.mailbox !== "ready"} onClick={() => void checkInbox()}>
              {s.checking ? "Checking…" : "Check inbox"}
            </button>
            <small role="status">{s.error ? `The relay did not answer: ${explain(s.error)}` : s.nothingNew ? "Nothing new since you last looked." : "opens on its own, then every minute while the app is open"}</small>
          </div>
        </header>
        <div className="ia-ib-body">
          {s.refused ? (
            <p className="ia-ib-refused">{`${s.refused} letter${s.refused > 1 ? "s" : ""} could not be opened: not sealed to your mailbox, or not a JitsuinFi letter. Ignored.`}</p>
          ) : null}
          {s.letters.length && role ? (
            <LongList
              items={s.letters}
              keyOf={(l) => l.r.relayId}
              stage={(l) => (l.state === "done" || actionable(l, s.handlers) ? "move" : "done")}
              words={(l) => `${letterLabel(l.r.message.header.type, role, l.r.message.header.body)} ${l.about ?? ""} ${l.r.message.header.from.role}`}
              labels={{ move: "To act on", wait: "Waiting", done: "Nothing to do here" }}
              searchLabel="Search letters by invoice number"
              limit={6}
              className="ia-letters"
              render={(l) => <LetterRow l={l} role={role} onLead={(x) => void lead(x)} leaving={leaving === l.r.relayId} />}
            />
          ) : (
            <p className="ia-ib-empty">Nothing new. Letters for your keys land here; each one carries its action.</p>
          )}
        </div>
        {contacts ? (
          <footer className="ia-ib-foot">
            <Link to={contacts.to} onClick={(e) => (e.preventDefault(), onLeave(contacts.to))}>
              <b lang="ja">名刺</b>Your contact card and contacts<span aria-hidden="true">→</span>
            </Link>
          </footer>
        ) : null}
      </aside>
    </>
  );
}
