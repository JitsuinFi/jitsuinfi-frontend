// Your next invoice key (HNK-25.T2, BL-D22-01, BL-D26-03, P-09; IA port part 2, 2026-10-26): who
// you are, the next invoice key from the history certificates on this device (checked against the
// board when it is read, wasm `historyNext`; the chain's relay copy reconciled first), and the key
// handed to a supplier: sent sealed to the supplier's mailbox, signed by that very key (one more
// passkey touch), or copied whole. Keys read as fingerprints (lib/print.ts readablePrint), the same
// format the supplier sees on its side, never as raw key text. On a desktop the block sits in the
// Invoices caption; on a phone it is its own screen (/buyer/invoices/key) one tap from Invoices.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Page } from "../../app/AppShell";
import { useStoreVersion } from "../../app/store-change";
import { Banner, Button, useOut } from "../../app/ui";
import { ScanButton } from "../../app/Scanner";
import { Dock } from "../../app/Dock";
import { routeScan } from "../../lib/scan";
import { myIdentity, relayDeps } from "../../lib/app-relay";
import { account } from "../../lib/app-session";
import { certFields, dropTail, freeable, localNextIndex, reconcile } from "../../lib/buyer-history";
import { contactId, contactName, type Contact } from "../../lib/contact";
import { sendKeyTo } from "../ContactAdd";
import { json, today, wasm } from "../../lib/core";
import { keyAfterOtherDevices, keyGivenNote, keyTakenNote } from "../../lib/key-match";
import { NET } from "../../lib/network";
import { readablePrint } from "../../lib/print";
import { draft, send } from "../../lib/relay";
import { encodeMessage, signingBytes, type Header } from "../../lib/relay-message";
import { myContact, takeContact } from "../MailboxCard";
import { backupHistory, backupProblem, chainState, changed, loadGiven, loadHistory, loadInvoices, noteGiven, readBoard, registeredNs, relayHistory, saveHistory, setKeyInfo, useKeyInfo, type Note } from "./data";
import { FilePill, plural, Tag } from "./parts";
import "../role-paper.css";
import "../buyer.css";
import { Lede } from "../../app/Lede";

const NOTE_GLYPH = { ok: "認", warn: "待", bad: "拒" } as const;

/**
 * Reads the next invoice key: one passkey touch for the keys, the relay's copy of the chain, then
 * the board (the chosen file, else the live board) to know which certificates are anchored.
 */
async function showKey(boardFile: File | undefined, then?: (master: Uint8Array, k: number, invoicePk: string) => Promise<void>): Promise<boolean> {
  let hist = await loadHistory();
  let k = localNextIndex(hist);
  const m = await account.stamp();
  const said: Note[] = [];
  try {
    const id = json<{ identity_pk: string }>(wasm.buyerKeysBytes(m.slice(), 0)).identity_pk;
    // the relay copy first: another device may have issued newer certificates
    let restored = 0;
    let relayUnread: unknown = null;
    // finding F10: certificates the other devices issued, from the synced (sealed, authenticated) records
    let otherCerts = 0;
    try {
      const remote = await relayHistory();
      if (remote) {
        if (reconcile(hist, remote, id).kind === "restored") otherCerts = remote.certs.length;
        const r = reconcile(hist, remote, id);
        if (r.kind === "restored") {
          hist = r.doc;
          k = localNextIndex(hist);
          restored = r.added;
        } else if (r.kind === "relay-behind") {
          await backupHistory(hist);
          said.push({ kind: "warn", title: "Your history backup was behind.", text: `It held ${plural(remote.certs.length, "certificate")}; this device has ${hist.certs.length}. The copy is updated now. If you did not remove anything yourself, the relay lost or held back your newest certificate.` });
        } else if (r.kind === "diverged") {
          said.push({ kind: "bad", title: "Your history backup differs from this device.", text: "The two copies disagree about an earlier certificate. This device keeps its own; do not issue a new certificate until you know which device holds your real history." });
        }
      } else if (hist.certs.length) {
        await backupHistory(hist);
      }
    } catch (e) {
      relayUnread = e; // said below, unless the board shows there is nothing it could hold
    }
    // HNK-34 E2E (finding 3): "no copy yet" (404) is normal and says nothing; a copy that could
    // not be read is said calmly, and not at all for a first-time buyer whose board check shows
    // no certificate anywhere (the copy could only hold what the board would show).
    const unreadNote = (): Note => ({ kind: "warn", title: "Your history backup was not read this time.", text: `${backupProblem(relayUnread)} This device's own copy is used; nothing is lost, and the backup is read again the next time you show your key.` });
    const boardJson = (await boardFile?.text()) ?? (await readBoard())?.json;
    let anchored: number | null = null;
    if (boardJson) {
      const r = json<{ next_index: number; dropped: number[]; successor_on_board: boolean }>(wasm.historyNext(JSON.stringify(hist.certs), id, boardJson));
      // E2E audit 2026-10-25: a certificate not on the board yet is dropped only when its deal
      // is over; one that may still be registered keeps its index (freeable)
      const loose = r.dropped.length ? freeable(hist.certs.map(certFields), r.dropped, registeredNs(boardJson), today()) : { drop: [], pending: [] };
      if (loose.drop.length) {
        hist = dropTail(hist, loose.drop);
        await saveHistory(hist);
        said.push({ kind: "warn", title: "Unused certificate removed.", text: `Certificate${loose.drop.length > 1 ? "s" : ""} #${loose.drop.join(", #")} never reached the board and ${loose.drop.length > 1 ? "their deals are" : "its deal is"} over (the invoice went to the board without it, or is past due), so the number is free again.` });
      }
      if (loose.pending.length) {
        const many = loose.pending.length > 1;
        said.push({ kind: "warn", title: `Certificate${many ? "s" : ""} not on the board yet.`, text: `Certificate${many ? "s" : ""} #${loose.pending.join(", #")} ${many ? "are" : "is"} not on the board, but ${many ? "their invoices are" : "its invoice is"} not registered and not due: the financier may still register ${many ? "them" : "it"}. ${many ? "They are" : "It is"} kept, so your next key comes after ${many ? "them" : "it"}. Reusing the number could anchor two invoices at one place in your history, which no financier accepts afterwards.` });
      }
      // restored certificates passed historyNext (signatures, links, anchors): keep them
      if (restored && !loose.drop.length) await saveHistory(hist);
      if (restored) said.push({ kind: "ok", title: "History restored from your backup.", text: `${restored} newer certificate${restored === 1 ? "" : "s"} from your other device, checked against the board.` });
      chainState.successorOnBoard = r.successor_on_board;
      if (relayUnread !== null && (hist.certs.length > 0 || r.next_index > 0 || chainState.successorOnBoard)) said.unshift(unreadNote());
      // the anchored certificates, then the kept ones whose deals may still register
      k = r.next_index + loose.pending.length;
      anchored = r.next_index;
      said.push(
        chainState.successorOnBoard
          ? { kind: "bad", title: "Your history is ahead of this device.", text: `The board already holds a certificate after #${r.next_index - 1 < 0 ? "start" : r.next_index - 1} that this device does not have. Do not issue a new certificate here: it would fork your history. Open this page on the device that issued it; its copy reaches the relay and comes back here.` }
          : { kind: "ok", title: "Your history matches the public board.", text: r.next_index ? `${plural(r.next_index, "financed invoice")} on record, paid as the board shows.` : "No financed invoice in it yet: this key starts it." },
      );
    } else {
      if (relayUnread !== null) said.push(unreadNote());
      if (restored) {
        hist = await loadHistory(); // an unchecked relay copy is not used
        k = localNextIndex(hist);
        said.push({ kind: "warn", text: `Your backup holds ${restored} newer record${restored === 1 ? "" : "s"} of your history; they are restored once the board can be read to check them.` });
      }
      said.push({ kind: "warn", title: "Not checked against the board.", text: "The board could not be read just now. Try again in a moment." });
    }
    // finding F10: a key below the certificates another device issued is used, whatever this
    // device could check: the board may be unreadable, but those certificates are this account's
    if (keyAfterOtherDevices(k, hist.certs.length, otherCerts).moved) {
      said.push({ kind: "ok", title: `Keys up to #${otherCerts - 1} are used on your other device.`, text: `It issued ${plural(otherCerts, "certificate")} of your history, so this device offers key #${otherCerts}. The certificates come to this device once the board can be read to check them.` });
      k = otherCerts;
    }
    // messy-state E2E 2026-10-27: invoices on this device (and, synced, on the others) that already name this key
    const invoices = await loadInvoices().catch(() => []);
    const taken = keyTakenNote(k, invoices.filter((x) => x.key_index === k).map((x) => ({ invoice_id: x.invoice_id, signed: !!x.signature })));
    if (taken) said.push(taken);
    else {
      const names = new Map((await account.current?.store?.list<Contact>().catch(() => []))?.filter((x) => x.id.startsWith("contact:")).map((x) => [x.doc.mailbox_pk, contactName(x.doc)]) ?? []);
      const given = keyGivenNote(k, await loadGiven(), (to) => names.get(to) ?? "a supplier without a card here");
      if (given) said.push(given);
    }
    const next = json<{ invoice_pk: string }>(wasm.buyerKeysBytes(m.slice(), k)).invoice_pk;
    setKeyInfo({ id, k, next, notes: said, anchored });
    changed();
    // mobile E2E 2, finding 5: show and send in one step, with the same passkey touch; never when
    // a note says this key must not be used (history ahead, key already taken)
    if (!then || said.some((n) => n.kind === "bad")) return false;
    await then(m.slice(), k, next);
    return true;
  } finally {
    m.fill(0);
  }
}

/** Sends the next invoice key sealed to a supplier's mailbox, signed with that key (one passkey touch). */
async function sendKey(c: Contact, k: number, invoicePk: string, master?: Uint8Array): Promise<void> {
  // judge run 3, finding 2: this buyer's fingerprint and @name go along, signed with the key, so
  // the supplier can add the buyer back in one confirm
  const me = myContact();
  const card = { fingerprint: me.fingerprint, ...(me.username ? { username: me.username } : {}) };
  const hd = draft("key.invoice_pk", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, c.mailbox_pk, relayDeps, { body: { invoice_pk: invoicePk, ...card } });
  const withSigner = { ...hd, signer: invoicePk } as Header;
  const m = master ?? (await account.stamp());
  const r = json<{ signer: string; sig: string }>(wasm.buyerMessageSignBytes(m, k, signingBytes(withSigner)));
  if (r.signer !== invoicePk) throw new Error("this key is not your invoice key");
  await send(c.mailbox_pk, await encodeMessage({ ...withSigner, sig: r.sig }), relayDeps);
}

/** The suppliers whose cards this device keeps: one tap sends them the key. */
function useSuppliers(): Contact[] {
  const [list, setList] = useState<Contact[]>([]);
  const k = useKeyInfo();
  const written = useStoreVersion("buyer"); // a card added on Contacts or from a contact link
  useEffect(() => {
    void account.current?.store
      ?.list<Contact>()
      .then((all) => setList(all.filter((x) => x.id.startsWith("contact:") && x.doc.role === "supplier").map((x) => x.doc)))
      .catch(() => undefined);
  }, [k, written]);
  return list;
}

/**
 * HNK-25.T2 (BL-D22-01): the next invoice key goes to a supplier through the relay, signed with
 * that very key, so the supplier knows it comes from its holder; or it is copied whole and handed
 * over by hand (the supplier's sheet takes the whole key).
 */
function ShareKey({ k, invoicePk, sent = null }: { k: number; invoicePk: string; sent?: string | null }): ReactNode {
  const card = useRef<HTMLTextAreaElement>(null);
  const out = useOut();
  const [copied, setCopied] = useState(false);
  const all = useSuppliers();
  // the supplier just added from a contact link goes first (ContactAdd.tsx sendKeyTo)
  const want = sendKeyTo.mailbox;
  const suppliers = [...all].sort((a, b) => Number(b.mailbox_pk === want) - Number(a.mailbox_pk === want));
  const [sentTo, setSentTo] = useState<string | null>(sent);
  const go = async (c: Contact) => {
    try {
      await sendKey(c, k, invoicePk);
      await noteGiven(k, c.mailbox_pk).catch(() => undefined);
      if (sendKeyTo.mailbox === c.mailbox_pk) sendKeyTo.mailbox = null;
      setSentTo(c.mailbox_pk);
      out.show(<Banner kind="ok" title={`Key sent to ${contactName(c)}`} text={`Sent privately to them: it fills the buyer line of the invoice they write. When they send it, it arrives in your inbox to sign.`} />);
    } catch (e) {
      out.error(e);
    }
  };
  return (
    <details className="by-share" open>
      <summary>Give this key to the supplier</summary>
      <div>
        <p className="hint">Each invoice uses a different key, so the public board cannot link your invoices. The supplier sees the same fingerprint on its side.</p>
        <div className="by-keyhex">
          <span className="by-keyhex-k">{k === 0 ? "Your first invoice key" : "Your next invoice key"}</span>
          <code className="by-keyhex-v is-print">{readablePrint(invoicePk)}</code>
          <Button
            secondary
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invoicePk);
                setCopied(true);
                await noteGiven(k, "copied").catch(() => undefined);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy the whole key"}
          </Button>
        </div>
        {suppliers.length ? (
          <div className="by-send-to">
            <p className="by-keyhex-or">Send it sealed to a supplier you keep a card for:</p>
            <div className="actions rp-small">
              {suppliers.map((c, i) => {
                const primary = i === 0 && sentTo === null;
                const b = (
                  <Button key={contactId(c)} secondary={!primary} onClick={() => go(c)}>
                    {sentTo === c.mailbox_pk ? `Sent to ${contactName(c)} · send again` : `Send to ${contactName(c)}`}
                  </Button>
                );
                // the screen's one primary rides the phone's bottom bar (mobile E2E 2026-10-27, finding 4)
                return primary ? (
                  <Dock key={contactId(c)} label="Send">
                    {b}
                  </Dock>
                ) : (
                  b
                );
              })}
            </div>
          </div>
        ) : null}
        <p className="by-keyhex-or">{suppliers.length ? "Or paste another supplier's contact link:" : "No supplier in your contacts yet. Open the contact link your supplier shared, or paste it here:"}</p>
        <label className="field">
          <span>The supplier's contact link or card</span>
          <textarea rows={2} spellCheck="false" autoCapitalize="none" autoCorrect="off" placeholder="https://…/app/contact#… or jitsuin-contact-v1:…" ref={card} />
        </label>
        <div className="actions rp-small">
          {/* a scanned contact QR fills the field; sending stays the person's own press */}
          <ScanButton
            what="the supplier's contact QR"
            onPaste={() => card.current?.focus()}
            onRead={(t) => {
              routeScan(t);
              card.current!.value = t;
              out.clear();
            }}
          />
          <Button
            secondary
            onClick={async () => {
              try {
                await go(await takeContact(card.current!.value, "supplier"));
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Send this key to the supplier
          </Button>
        </div>
        {out.el}
      </div>
    </details>
  );
}

/** Who you are, the next invoice key, and how it reaches a supplier. */
export function KeyBlock({ hidden }: { hidden?: boolean } = {}): ReactNode {
  const info = useKeyInfo();
  const board = useRef<HTMLInputElement>(null);
  const out = useOut();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const s = account.current;
  // mobile E2E 2, finding 5: arriving from "Add @supplier" → "Send them your next invoice key", the
  // bottom bar sends it at once: one passkey touch shows the key and sends it sealed to them
  const suppliers = useSuppliers();
  const want = info ? null : (suppliers.find((c) => c.mailbox_pk === sendKeyTo.mailbox) ?? null);
  const showAndSend = async (c: Contact) => {
    setBusy(true);
    try {
      const sent = await showKey(board.current?.files?.[0], async (m, k, next) => {
        await sendKey(c, k, next, m);
        await noteGiven(k, c.mailbox_pk).catch(() => undefined);
      });
      if (sent) {
        sendKeyTo.mailbox = null;
        setSentTo(c.mailbox_pk);
        out.show(<Banner kind="ok" title={`Key sent to ${contactName(c)}`} text="Sent privately to them: it fills the buyer line of the invoice they write. When they send it, it arrives in your inbox to sign." />);
      } else out.clear();
    } catch (e) {
      out.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="by-keyblock" hidden={hidden || undefined}>
      <dl className="by-who" aria-label="Your keys">
        <div>
          <dt>{s?.demo ? "Your key fingerprint · test data" : "Your key fingerprint"}</dt>
          <dd className="by-fp">{s?.fingerprint ?? ""}</dd>
        </div>
        <div>
          <dt>Next invoice</dt>
          <dd>
            {info ? (
              <>
                <b>{`#${info.k}`}</b>
                {" in your history · key "}
                <span className="by-fp is-sub">{readablePrint(info.next)}</span>
              </>
            ) : (
              <span className="by-quiet">shown when you ask for it</span>
            )}
          </dd>
        </div>
      </dl>
      {info?.notes.map((n, i) => (
        <div className={`by-keynote is-${n.kind}`} key={i} role={n.kind === "bad" ? "alert" : "status"}>
          <span className="rp-hanko" lang="ja" aria-hidden="true">
            {NOTE_GLYPH[n.kind]}
          </span>
          <p>
            {n.title ? <b>{n.title}</b> : null} {n.text}
          </p>
        </div>
      ))}
      {want ? (
        <div className="by-keyrow by-sendnow">
          <p className="hint">{`One passkey touch shows your next invoice key and sends it sealed to ${contactName(want)}.`}</p>
          <Dock label="Send">
            <button type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void showAndSend(want)}>
              {busy ? "Reading your keys…" : `Send to ${contactName(want)}`}
            </button>
          </Dock>
        </div>
      ) : null}
      <div className="by-keyrow">
        <button
          type="button"
          className={info || want ? "secondary" : undefined}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await showKey(board.current?.files?.[0]);
              out.clear();
            } catch (e) {
              out.error(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Reading your keys…" : "Show my next invoice key"}
        </button>
      </div>
      {/* judge run 2: the board file and the history ID are details, not a second main action (DS-MOB P2, P3) */}
      <details className="by-keymore">
        <summary>Details</summary>
        <div>
          <dl className="by-who">
            <div>
              <dt>Your history ID</dt>
              <dd>{info ? <span className="by-fp is-sub">{readablePrint(info.id)}</span> : <span className="by-quiet">shown with your next invoice key</span>}</dd>
            </div>
          </dl>
          <Lede className="by-help">{`Your next key is checked against the live ${NET.noun} board (or the last copy this browser saw, if the node does not answer). To check against a board file you were given instead, choose it here before you ask for the key. Your keys come from your passkey; nothing secret is stored.`}</Lede>
          <FilePill label="A board file to check against" empty="no board file: the live board is read" inputRef={board} />
        </div>
      </details>
      {out.el}
      {info ? <ShareKey key={sentTo ?? "-"} k={info.k} invoicePk={info.next} sent={sentTo} /> : null}
    </div>
  );
}

/** /buyer/invoices/key: the block as its own screen on a phone, back to Invoices. */
export function KeyPage(): ReactNode {
  return (
    <Page wide>
      <div className="rp by">
        <section className="rp-sec by-keypage" aria-labelledby="by-tk">
          <div className="rp-cap">
            <Tag section="Invoices" />
            <h1 id="by-tk">Your next invoice key</h1>
            <p className="rp-lede">A supplier addresses your next invoice to this key. Send it to them privately from here, or copy it whole.</p>
            <KeyBlock />
          </div>
        </section>
      </div>
    </Page>
  );
}
