// Apply as financier (HNK-26.T25, D-46 B): a financier gets its own node from the node provider.
// The application is sealed to the provider's mailbox (the relay keeps ciphertext only); the
// signed invite comes back sealed to a mailbox key this browser keeps for the reply.
//
// The stage (HNK-30.T15, MASTER.md §8): the 登記所's application window. The applicant fills in a
// 申請書 on the counter; sending folds it into an envelope sealed 〆 and drops it into the relay's
// post box behind the glass. The invite comes back as a letter in the reply tray, with the
// provider's signature checked before the link is shown. React since HNK-31.T10.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { relay as hairlineRelay } from "@lucasmarkes/hairline";
import { Page } from "../app/AppShell";
import { relayDeps } from "../lib/app-relay";
import { inviteLinkOk, PROVIDER } from "../lib/provider";
import { draft, ensureMailbox, receive, send } from "../lib/relay";
import { encodeMessage, verifyHeader, type Header } from "../lib/relay-message";
import { dur, ease, run, still } from "./try/anim";

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

function Line({ jp, en, children }: { jp: string; en: string; children: ReactNode }): ReactNode {
  return (
    <label className="ap-line">
      <span>
        <b lang="ja">{jp}</b>
        {en}
      </span>
      {children}
    </label>
  );
}

export function ApplyPage(): ReactNode {
  const sentAt = useRef(store()?.getItem(SENT)).current;
  const [said, setSaid] = useState({
    glyph: sentAt ? "待" : "申",
    text: sentAt ? `Your application went in on ${sentAt.slice(0, 10)}. The provider reviews it and sets up your node; the invite comes back to this tray, in this browser.` : "A financier runs its own node: its wallet, its keys, its console. Apply here; the provider sets up your node and sends you a one-time invite.",
  });
  const [count, setCount] = useState(sentAt ? "1 sealed" : "empty");
  const [posting, setPosting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [env, setEnv] = useState<{ left: number; top: number } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const name = useRef<HTMLInputElement>(null);
  const contact = useRef<HTMLInputElement>(null);
  const note = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLElement>(null);
  const scene = useRef<HTMLElement>(null);
  const mouth = useRef<HTMLSpanElement>(null);
  const envEl = useRef<HTMLSpanElement>(null);
  const letter = useRef<HTMLElement>(null);
  const route = useRef<HTMLDivElement>(null);
  const speak = (glyph: string, text: string) => setSaid({ glyph, text });

  // the relay drawn as hairline's hub of branches: a message hops tile by tile to one mailbox
  useEffect(() => {
    requestAnimationFrame(() => route.current && hairlineRelay(route.current, { intensity: 0.6, play: true, label: "The relay: a sealed message hops to one mailbox" }));
  }, []);

  const delta = (from: Element, to: Element) => {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) };
  };

  const post = async () => {
    setPosting(true);
    try {
      const n = name.current!.value.trim();
      const c = contact.current!.value.trim();
      if (!n || !c) throw new Error("Give a name and a way to reach you first.");
      const seed = replySeed();
      const me = await ensureMailbox(seed, relayDeps);
      const body: Record<string, string | boolean> = { name: n, contact: c };
      if (note.current!.value.trim()) body.note = note.current!.value.trim();
      if (list.current!.checked) body.list = true;
      const hd = draft("financier.apply", { role: "applicant", mailbox_pk: me.mailbox_pk }, PROVIDER.mailbox_pk, relayDeps, { body }) as Header;
      await send(PROVIDER.mailbox_pk, await encodeMessage(hd), relayDeps);
      store()?.setItem(SENT, new Date().toISOString());
      // fold the form into an envelope and drop it into the post box
      const f = form.current!.getBoundingClientRect();
      const s = scene.current!.getBoundingClientRect();
      flushSync(() => setEnv({ left: f.left - s.left + f.width / 2 - 70, top: f.top - s.top + f.height / 2 - 46 }));
      if (!still()) {
        await run(form.current!, { scaleY: [1, 0.3], opacity: [1, 0.2], duration: dur.enter }, ease.softInOut);
        const d = delta(envEl.current!, mouth.current!);
        await run(envEl.current!, { x: [0, d.x * 0.6, d.x], y: [0, d.y - 120, d.y - 10], rotate: [-4, 8, 0], duration: 900 }, ease.softInOut);
        await run(envEl.current!, { y: d.y + 30, scale: 0.6, opacity: [1, 0], duration: dur.exit }, ease.accelExit);
        void run(form.current!, { scaleY: [0.3, 1], opacity: [0.2, 1], duration: dur.enter });
      }
      setEnv(null);
      setCount("1 sealed");
      speak("済", "Posted. Sealed to the node provider: the relay only holds ciphertext. Your invite will come back to this tray, in this browser.");
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
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
      const inv = r.messages.map((m) => m.message.header).find((x) => x.type === "financier.invite");
      if (!inv) {
        speak("待", "No invite yet. The provider reviews each application; check again later.");
        return;
      }
      const link = (inv.body as { link?: string }).link ?? "";
      if (!(await verifyHeader(inv, PROVIDER.signer_pk)) || !inviteLinkOk(link)) {
        speak("偽", "A letter arrived, but it is not signed by the node provider. Do not open it.");
        return;
      }
      flushSync(() => setInvite(link));
      if (!still()) await run(letter.current!, { y: [-60, 0], rotate: [-6, -1], opacity: [0, 1], duration: dur.enter + 100 }, ease.snapSettle);
      speak("認", "Signed by the node provider. The invite is in the tray.");
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Page wide>
      <div className="try ap-page" data-wide="true">
        <header className="try-head">
          <p className="try-case">
            <span lang="ja">申</span>
            Financier application
          </p>
          <h1>Become a financier</h1>
          <p>Run your own JitsuinFi node, managed for you: its wallet, its keys and a passkey console. No terminal.</p>
        </header>
        <section className="ct ap" aria-label="The application window" ref={scene}>
          {/* the counter: the application form */}
          <div className="ct-desk ap-desk">
            <article className="ap-form" ref={form}>
              <header>
                <p className="ap-t" lang="ja">
                  申 請 書
                </p>
                <p className="ap-sub">Application for a financier node</p>
              </header>
              <Line jp="名称" en="Company or fund">
                <input type="text" maxLength={80} autoComplete="organization" placeholder="e.g. Kurogane Capital" ref={name} />
              </Line>
              <Line jp="連絡先" en="How we reach you">
                <input type="text" maxLength={120} autoComplete="email" placeholder="email or phone" ref={contact} />
              </Line>
              <Line jp="備考" en="Anything we should know (optional)">
                <textarea rows={3} maxLength={1000} placeholder="What you finance, roughly how much, where you are" ref={note} />
              </Line>
              <label className="ap-opt">
                <input type="checkbox" ref={list} />
                <span>
                  <b lang="ja">名簿掲載</b>
                  List me in the financier directory. Suppliers then see your name, your contact card and the coarse mandate you set in your console; nothing about your deals.
                </span>
              </label>
              <p className="ap-small">Sealed to the node provider before it leaves this page. The relay stores ciphertext only.</p>
            </article>
            <div className="ct-act">
              <button type="button" className="seal-btn" disabled={posting} onClick={() => void post()}>
                <span>Seal it and post it</span>
              </button>
              <button type="button" className="ink-link" disabled={checking} onClick={() => void check()}>
                Check for my invite
              </button>
            </div>
          </div>
          {/* behind the glass: the relay's post box and the reply tray */}
          <div className="ct-window">
            <p className="ct-plaque">
              <span lang="ja">申請窓口</span>
              <small>Applications</small>
            </p>
            <div className="ct-room ap-room">
              <div className="ct-light" aria-hidden="true">
                <span className="ct-cone" />
              </div>
              <span className="ct-lamp" aria-hidden="true">
                <i />
              </span>
              <div className="ap-box" aria-hidden="true">
                <span className="ap-box-mouth" ref={mouth} />
                <span className="ap-box-label" lang="ja">
                  中継
                </span>
                <span className="ap-box-sub">relay</span>
                <span className="ap-box-count">{count}</span>
              </div>
              <div className="ap-tray">
                <p className="ap-tray-k">
                  <b lang="ja">返信</b>
                  Reply tray
                </p>
                {invite ? (
                  <article className="ap-letter" ref={letter}>
                    <p className="ap-t" lang="ja">
                      招 待 状
                    </p>
                    <p>Your node is ready. Open the invite to create the passkey for your financier console. It works once: open it on the device you will use.</p>
                    <a className="seal-btn" href={invite}>
                      <span>Open your invite</span>
                    </a>
                    <span className="ap-letter-seal" lang="ja" aria-hidden="true">
                      提供者
                    </span>
                  </article>
                ) : null}
              </div>
              <div className="ap-route" ref={route} />
              <p className="ct-say" aria-live="polite">
                <span className="hanko" lang="ja">
                  {said.glyph}
                </span>
                <span>{said.text}</span>
              </p>
            </div>
            <span className="ct-grille" aria-hidden="true" />
            <span className="ct-slot" aria-hidden="true" />
          </div>
          {env ? (
            <span className="ap-env" aria-hidden="true" style={{ left: `${env.left}px`, top: `${env.top}px` }} ref={envEl}>
              <b lang="ja">〆</b>
            </span>
          ) : null}
        </section>
      </div>
    </Page>
  );
}
