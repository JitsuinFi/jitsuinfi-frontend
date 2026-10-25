// Apply as financier (HNK-26.T25, D-46 B): a financier gets its own node from the node provider.
// The application is sealed to the provider's mailbox (the relay keeps ciphertext only); the
// signed invite comes back sealed to a mailbox key this browser keeps for the reply.
//
// Look (HNK-34.T5, approved sample design-samples/internal/apply.html): the 申請書 is a letter on
// paper. Sending folds it into an envelope sealed 〆 that drops into the relay's post box 中継,
// and the applicant's copy gets the 受付 date stamp. The invite comes back to the reply tray as a
// 招待状, with the provider's signature checked before the link is shown; a letter the provider
// did not sign lands stamped 偽, without a link. The caption follows the four-step path.
// React since HNK-31.T10.
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Page } from "../app/AppShell";
import { relayDeps } from "../lib/app-relay";
import { inviteLinkOk, PROVIDER } from "../lib/provider";
import { draft, ensureMailbox, receive, send } from "../lib/relay";
import { encodeMessage, verifyHeader, type Header } from "../lib/relay-message";
import { dur, ease, rectIn, run, still } from "./try/anim";
// stylesheet: src/pages/apply.css, loaded with the app shell (src/app/app-styles.ts)

const SEED = "jitsuin.apply.seed";
const SENT = "jitsuin.apply.sent";

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** The reply mailbox key of this browser's application (made once, kept in this browser). */
function replySeed(): Uint8Array {
  const st = store();
  const kept = st?.getItem(SEED);
  if (kept && /^[0-9a-f]{64}$/.test(kept)) return Uint8Array.from(kept.match(/../g)!, (b) => parseInt(b, 16));
  const seed = crypto.getRandomValues(new Uint8Array(32));
  st?.setItem(SEED, Array.from(seed, (b) => b.toString(16).padStart(2, "0")).join(""));
  return seed;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dated = (d: Date) => ({
  jp: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
  en: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  stamp: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
});

const PATH: Array<[string, string, string]> = [
  ["記", "Fill in the 申請書", "Your name, how to reach you and, if you like, what you finance."],
  ["〆", "Sealed and posted", "Sealed to the node provider before it leaves this page. The relay stores ciphertext only."],
  ["審", "The provider sets up your node", "Its wallet, its keys, its console. The provider reviews each application."],
  ["招", "The invite comes back here", "To this tray, in this browser, signed by the node provider. It works once."],
];

type Say = { mk: string; text: string; bad?: boolean };
type Invite = { ok: true; link: string } | { ok: false };

export function ApplyPage(): ReactNode {
  const [sentAt, setSentAt] = useState<string | null>(() => store()?.getItem(SENT) ?? null);
  const [said, setSaid] = useState<Say>(() =>
    sentAt
      ? { mk: "待", text: `Your application went in on ${sentAt.slice(0, 10)}. The provider reviews it and sets up your node; the invite comes back to this tray, in this browser.` }
      : { mk: "申", text: "A financier runs its own node: its wallet, its keys, its console. Apply here; the provider sets up your node and sends you a one-time invite." },
  );
  const [posting, setPosting] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [bad, setBad] = useState({ name: false, contact: false });
  const name = useRef<HTMLInputElement>(null);
  const contact = useRef<HTMLInputElement>(null);
  const note = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLInputElement>(null);
  const letter = useRef<HTMLFormElement>(null);
  const vis = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const mouth = useRef<SVGRectElement>(null);
  const env = useRef<HTMLSpanElement>(null);
  const uke = useRef<HTMLDivElement>(null);
  const inv = useRef<HTMLElement>(null);
  const speak = (mk: string, text: string, isBad = false) => setSaid({ mk, text, bad: isBad });

  /** The letter folds in three into an envelope sealed 〆, which drops into the relay's slot. */
  const fold = async () => {
    if (still()) return;
    const host = vis.current!;
    const l = rectIn(letter.current!, host);
    const m = rectIn(mouth.current!, host);
    const e = env.current!;
    await run(letter.current!, { scaleY: [1, 0.33], opacity: [1, 0.25], duration: dur.enter }, ease.softInOut);
    const x0 = l.x + l.w / 2 - 75;
    const y0 = l.y + l.h / 2 - 48;
    const x1 = m.x + m.w / 2 - 75;
    const y1 = m.y + m.h / 2 - 48;
    e.classList.add("is-on");
    await run(e, { x: [x0, x0 + (x1 - x0) * 0.6, x1], y: [y0, Math.min(y0, y1) - 120, y1 - 30], rotate: [-4, 8, 0], duration: 900 }, ease.softInOut);
    await run(e, { y: [y1 - 30, y1 + 40], scale: [1, 0.6], opacity: [1, 0], duration: dur.exit }, ease.accelExit);
    e.classList.remove("is-on");
    void run(box.current!, { y: [0, 3, 0], duration: dur.fade });
    await run(letter.current!, { scaleY: [0.33, 1], opacity: [0.25, 1], duration: dur.enter }, ease.softLand);
  };

  const post = async (ev: FormEvent) => {
    ev.preventDefault();
    if (posting) return;
    setPosting(true);
    try {
      const n = name.current!.value.trim();
      const c = contact.current!.value.trim();
      setBad({ name: !n, contact: !c });
      if (!n || !c) throw new Error("Give a name and a way to reach you first.");
      const seed = replySeed();
      const me = await ensureMailbox(seed, relayDeps);
      const body: Record<string, string | boolean> = { name: n, contact: c };
      if (note.current!.value.trim()) body.note = note.current!.value.trim();
      if (list.current!.checked) body.list = true;
      const hd = draft("financier.apply", { role: "applicant", mailbox_pk: me.mailbox_pk }, PROVIDER.mailbox_pk, relayDeps, { body }) as Header;
      await send(PROVIDER.mailbox_pk, await encodeMessage(hd), relayDeps);
      const at = new Date().toISOString();
      store()?.setItem(SENT, at);
      flushSync(() => setSealed(true));
      await fold();
      flushSync(() => setSentAt(at));
      if (!still() && uke.current) void run(uke.current, { rotate: [-12, -12], y: [-40, 0], scale: [1.25, 1], opacity: [0, 0.92], duration: dur.seal }, ease.snapSettle);
      speak("済", "Posted. Sealed to the node provider: the relay only holds ciphertext. Your invite will come back to this tray, in this browser.");
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e), true);
    } finally {
      setPosting(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      if (!store()?.getItem(SEED)) throw new Error("Send an application from this browser first.");
      flushSync(() => speak("待", "Opening the reply tray with this browser's key…"));
      const r = await receive(replySeed(), relayDeps);
      const found = r.messages.map((m) => m.message.header).find((x) => x.type === "financier.invite");
      if (!found) {
        speak("待", "No invite yet. The provider reviews each application; check again later.");
        return;
      }
      const link = (found.body as { link?: string }).link ?? "";
      const ok = (await verifyHeader(found, PROVIDER.signer_pk)) && inviteLinkOk(link);
      flushSync(() => setInvite(ok ? { ok: true, link } : { ok: false }));
      if (inv.current) await run(inv.current, { y: [-60, 0], rotate: [-6, -1], opacity: [0, 1], duration: dur.proof }, ease.snapSettle);
      if (!ok) speak("偽", "A letter arrived, but it is not signed by the node provider. Do not open it.", true);
      else speak("認", "Signed by the node provider. The invite is in the tray.");
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e), true);
    } finally {
      setChecking(false);
    }
  };

  // where the application is: 1 fill in, 3 the provider sets up (after posting), 5 all done
  const at = invite?.ok ? 5 : sentAt ? 3 : 1;
  const today = dated(sentAt ? new Date(sentAt) : new Date());

  return (
    <Page wide>
      <div className="ap">
        <section className="ap-sec" aria-labelledby="ap-h">
          {/* caption: ≤ 35% */}
          <div className="ap-cap">
            <p className="ap-eyebrow">
              <span className="ap-stamp" lang="ja" aria-hidden="true">
                申
              </span>
              Financier application
            </p>
            <h1 id="ap-h">Become a financier</h1>
            <p className="ap-lede">Run your own JitsuinFi node, managed for you: its wallet, its keys and a passkey console. No terminal.</p>
            <ol className="ap-path" aria-label="Where your application is">
              {PATH.map(([k, title, line], i) => {
                const p = i + 1;
                const cls = p === 4 && invite && !invite.ok ? "is-bad" : p < at ? "is-done" : p === at ? "is-now" : undefined;
                return (
                  <li key={k} className={cls} aria-current={p === at ? "step" : undefined}>
                    <span className="ap-k" lang="ja" aria-hidden="true">
                      {k}
                    </span>
                    <div>
                      <strong>{title}</strong>
                      <span>{line}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* the visual: ≥ 65% */}
          <div className="ap-vis" ref={vis}>
            <div className="ap-left">
              <form className={`ap-letter${sealed || sentAt ? " is-sealed" : ""}${sentAt ? " is-received" : ""}`} id="ap-letter" noValidate aria-labelledby="ap-title" onSubmit={(e) => void post(e)} ref={letter}>
                <div className="ap-top">
                  <p className="ap-to">
                    JitsuinFi node provider <span lang="ja">御中</span>
                    <small>To the node provider</small>
                  </p>
                  <p className="ap-date">
                    <span lang="ja">{today.jp}</span>
                    <small>{today.en}</small>
                  </p>
                </div>
                <p className="ap-title" id="ap-title" lang="ja">
                  申 請 書
                </p>
                <p className="ap-sub">Application for a financier node</p>
                <p className="ap-say-l">I apply to run a financier node on JitsuinFi: its own wallet, its keys and a passkey console.</p>
                <p className="ap-ki" lang="ja" aria-hidden="true">
                  記
                </p>

                <label className={`ap-fl${bad.name ? " is-bad" : ""}`}>
                  <span className="ap-lab">
                    <b lang="ja">
                      <i>一</i>名称
                    </b>
                    <small>Company or fund</small>
                  </span>
                  <input type="text" maxLength={80} autoComplete="organization" placeholder="e.g. Kurogane Capital" ref={name} aria-invalid={bad.name || undefined} onInput={() => bad.name && setBad({ ...bad, name: false })} />
                </label>
                <label className={`ap-fl${bad.contact ? " is-bad" : ""}`}>
                  <span className="ap-lab">
                    <b lang="ja">
                      <i>二</i>連絡先
                    </b>
                    <small>How we reach you</small>
                  </span>
                  <input type="text" className="is-plain" maxLength={120} autoComplete="email" placeholder="email or phone" ref={contact} aria-invalid={bad.contact || undefined} onInput={() => bad.contact && setBad({ ...bad, contact: false })} />
                </label>
                <label className="ap-fl is-note">
                  <span className="ap-lab">
                    <b lang="ja">
                      <i>三</i>備考
                    </b>
                    <small>Anything we should know (optional)</small>
                  </span>
                  <textarea rows={3} maxLength={1000} placeholder="What you finance, roughly how much, where you are" ref={note} />
                </label>
                <label className="ap-opt">
                  <input type="checkbox" ref={list} />
                  <span>
                    <b lang="ja">名簿掲載</b>
                    List me in the financier directory. Suppliers then see your name, your contact card and the coarse mandate you set in your console; nothing about your deals.
                  </span>
                </label>

                <div className="ap-end">
                  <p>Sealed to the node provider before it leaves this page. The relay stores ciphertext only.</p>
                  <div className="ap-lseal" aria-hidden="true">
                    <span>
                      <b lang="ja">〆</b>
                    </span>
                    <small lang="ja">封緘</small>
                  </div>
                </div>
                <div className="ap-uke" aria-hidden="true" ref={uke}>
                  <svg viewBox="0 0 112 112">
                    <circle cx={56} cy={56} r={52} strokeWidth={3.5} />
                    <circle cx={56} cy={56} r={45} strokeWidth={1.2} />
                    <line x1={14} y1={44} x2={98} y2={44} />
                    <line x1={14} y1={70} x2={98} y2={70} />
                    <text className="t1" x={58} y={36}>
                      受付
                    </text>
                    <text className="t2" x={56} y={62}>
                      {today.stamp}
                    </text>
                    <text className="t3" x={56} y={86}>
                      RELAY
                    </text>
                  </svg>
                </div>
              </form>
              <div className="ap-act">
                <button type="submit" form="ap-letter" className={`ap-btn${posting ? " is-busy" : ""}`} disabled={posting}>
                  <b lang="ja" aria-hidden="true">
                    〆
                  </b>
                  Seal it and post it
                </button>
                <button type="button" className={`ap-link${checking ? " is-busy" : ""}`} disabled={checking} onClick={() => void check()}>
                  Check for my invite
                </button>
              </div>
            </div>

            <div className="ap-right" role="group" aria-label="The application window">
              <p className="ap-plaque">
                <b lang="ja">申請窓口</b>
                <small>Applications</small>
              </p>
              <div className="ap-box" ref={box}>
                <svg viewBox="0 0 260 300" aria-hidden="true">
                  <rect className="lid" x={18} y={10} width={224} height={34} rx={17} />
                  <rect className="body" x={30} y={40} width={200} height={214} rx={10} />
                  <rect className="lip" x={56} y={70} width={148} height={22} rx={11} />
                  <rect className="mouth" x={66} y={77} width={128} height={8} rx={4} ref={mouth} />
                  <line className="rule" x1={30} y1={110} x2={230} y2={110} />
                  <text className="kj" x={132} y={152}>
                    中継
                  </text>
                  <text className="en" x={130} y={172}>
                    relay · ciphertext only
                  </text>
                  <rect className="ctp" x={80} y={188} width={100} height={26} rx={13} />
                  <text className="ct" x={130} y={205}>
                    {sentAt ? "1 sealed" : "empty"}
                  </text>
                  <rect className="door" x={46} y={224} width={168} height={20} rx={4} />
                  <circle className="keyhole" cx={130} cy={234} r={3} />
                  <line className="post" x1={130} y1={254} x2={130} y2={296} />
                  <line className="post" x1={96} y1={296} x2={164} y2={296} />
                </svg>
              </div>
              <p className="ap-box-note">The relay passes your sealed letter to one mailbox, the node provider's. It cannot read it.</p>

              <div className="ap-tray">
                <p className="ap-tray-k">
                  <b lang="ja">返信</b>
                  Reply tray
                </p>
                <div className="ap-bed">
                  {invite ? (
                    <article className={`ap-inv${invite.ok ? "" : " is-forged"}`} ref={inv} aria-label={invite.ok ? "Invite from the node provider" : "A letter not signed by the node provider"}>
                      <p className="ap-inv-t" lang="ja">
                        招待状
                      </p>
                      <p>Your node is ready. Open the invite to create the passkey for your financier console. It works once: open it on the device you will use.</p>
                      {invite.ok ? (
                        <a className="ap-btn" href={invite.link}>
                          Open your invite
                        </a>
                      ) : null}
                      <span className="ap-from" lang="ja" aria-hidden="true">
                        提供者
                      </span>
                      <span className="ap-gi" lang="ja" aria-hidden="true">
                        偽
                      </span>
                    </article>
                  ) : (
                    <p className="ap-empty">Nothing here yet. The invite comes back to this tray, in this browser.</p>
                  )}
                </div>
              </div>
              <p className={`ap-say${said.bad ? " is-bad" : ""}`} role="status" aria-live="polite">
                <span className="ap-mk" lang="ja" aria-hidden="true">
                  {said.mk}
                </span>
                <span>{said.text}</span>
              </p>
            </div>
            <span className="ap-env" aria-hidden="true" ref={env}>
              <svg viewBox="0 0 150 96">
                <rect className="e-body" x={1} y={1} width={148} height={94} rx={3} />
                <path className="e-flap" d="M1 4 L75 54 L149 4" />
                <text x={75} y={84}>
                  〆
                </text>
              </svg>
            </span>
          </div>
        </section>
      </div>
    </Page>
  );
}
