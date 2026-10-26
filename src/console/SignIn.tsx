// The console's door (HNK-34.T5, sample console-signin.html): sign in with the paired passkey, the
// judges' demo door, a console without a passkey yet, a console switched off, and a node that did
// not answer. The caption holds the one action; the door beside it shows what it does.
import { useState, type ReactNode } from "react";
import { Chevron, PasskeyIcon } from "../app/auth";
import { Door, useDoor, type DoorFacts, type Lock } from "./Door";
import { Foot, LockGlyph, netLabel, Stamp, TopBar } from "./bits";
import { keptName } from "./name";
import { assert, creationOptions, post, registrationJson } from "./node";

export interface Msg {
  text: string;
  info?: boolean;
}

export const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.charAt(0).toUpperCase() + m.slice(1);
};

/** The status line under the action: 拒 for a refusal, 閉 for a closed door. */
export function Message({ msg }: { msg: Msg | null }): ReactNode {
  return (
    <p className={`cs-msg${msg?.info ? " is-info" : ""}`} role="alert" hidden={!msg?.text}>
      {msg?.text ?? ""}
    </p>
  );
}

export function LockLine(): ReactNode {
  return (
    <div className="cs-lockline">
      <p>
        <LockGlyph />
        Protected by your device passkey
      </p>
      <p>
        Works only on <code>{location.host}</code>
      </p>
    </div>
  );
}

/** A grouped list row: lead mark, label and line, chevron; it spins while its action runs. */
export function DoorRow({ lead, label, line, busy, disabled, run }: { lead: ReactNode; label: string; line: string; busy: boolean; disabled: boolean; run: () => void }): ReactNode {
  return (
    <button type="button" className={`cs-row${busy ? " is-busy" : ""}`} disabled={disabled} onClick={run}>
      {lead}
      <span>
        <strong>{label}</strong>
        <small>{line}</small>
      </span>
      <Chevron />
    </button>
  );
}

export const KanjiLead = ({ k }: { k: string }) => (
  <span className="cs-lead is-kanji" lang="ja" aria-hidden="true">
    {k}
  </span>
);
export const KeyLead = () => (
  <span className="cs-lead">
    <PasskeyIcon />
  </span>
);

/** The page around the door: the console's bar, the caption (≤ 35%) and the door (≥ 65%). */
export function DoorPage({ net, eyebrow, title, lede, children, door, visCap }: { net: string | null; eyebrow: string; title: string; lede?: string; children?: ReactNode; door: ReactNode; visCap: string }): ReactNode {
  return (
    <div className="cs">
      <TopBar
        net={net}
        where={
          <span className="cs-where">
            <b>
              Financier<span className="cs-long"> console</span>
            </b>
            <code>{location.host}</code>
          </span>
        }
      />
      <main className="cs-sec is-door" id="cs-main" tabIndex={-1} aria-labelledby="cs-door-t">
        <div className="cs-cap">
          <p className="cs-eyebrow">
            <Stamp k="融" />
            <span>{eyebrow}</span>
          </p>
          <h1 id="cs-door-t">{title}</h1>
          {lede ? <p className="cs-lede">{lede}</p> : null}
          {children}
        </div>
        <div className="cs-vis">
          {door}
          <p className="cs-vis-cap">{visCap}</p>
        </div>
      </main>
      <Foot />
    </div>
  );
}

interface View {
  title: string;
  lede?: string;
  lock: Lock;
  empty?: string;
  capKanji: string;
  cap: string;
  visCap: string;
}

/** Signed out: the door for this console's state. */
export function SignIn({ session, info, rerender }: { session: { console: boolean; paired: boolean; demo?: boolean }; info: DoorFacts; rerender: () => void }): ReactNode {
  const name = keptName();
  const door = useDoor();
  const [msg, setMsg] = useState<Msg | null>(session.console ? null : { text: "The console is off on this node. Ask your node provider.", info: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const run = (id: string, fn: () => Promise<void>) => async () => {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
      await door.press();
      setSaid("Signed in. Your desk opens behind the door.");
      rerender();
    } catch (e) {
      setMsg({ text: errText(e) });
    } finally {
      setBusy(null);
    }
  };
  const login = () => assert("/node/console/login/start", "/node/console/login/finish").then(() => undefined);
  const mode = !session.console ? "off" : session.demo ? "demo" : !session.paired ? "unpaired" : "login";
  const v: View = {
    off: { title: "Financier console", lock: "waiting" as Lock, capKanji: "閉", cap: "Closed by the node provider", visCap: "The node is awake, but its console door is closed." },
    demo: {
      title: "Try the financier console",
      lede: "A demo node on Zcash testnet. Sign in as its financier: read its sealed mailbox and see how payments wait for your passkey. Nothing here moves money.",
      lock: "waiting" as Lock,
      capKanji: "試",
      cap: "Demo node · nothing here moves money",
      visCap: "A demo node: any visitor can set a seal for this door. It opens on a mailbox of testnet deals.",
    },
    unpaired: {
      title: "Financier console",
      lede: "No passkey is set up for this console yet. Open the invite link your node provider sent you.",
      lock: "empty" as Lock,
      empty: "No seal set for this door yet",
      capKanji: "鍵",
      cap: "The invite sets your seal",
      visCap: "The door has no seal yet. The one-time invite from your node provider sets it.",
    },
    login: {
      title: name ? `Welcome back, ${name}` : "Log in to your console",
      lede: "Use the passkey you set up for this console.",
      lock: "waiting" as Lock,
      capKanji: "印",
      cap: "Your passkey opens this door",
      visCap: "The light under the door is your node, awake. Your passkey is the seal it knows; nothing else opens it.",
    },
  }[mode];
  return (
    <DoorPage
      net={netLabel(info.network)}
      eyebrow="Financier console"
      title={v.title}
      lede={v.lede}
      visCap={said ?? v.visCap}
      door={<Door door={door} lock={v.lock} empty={v.empty} cap={v.cap} capKanji={v.capKanji} name={name} facts={info} room="Your mailbox, your devices and your node. Every payment waits for your passkey." closed={mode === "off"} />}
    >
      {mode === "login" ? (
        <div className="cs-form">
          <div className="cs-list">
            <DoorRow lead={<KeyLead />} label="Continue with passkey" line="Fingerprint, face or device PIN" busy={busy === "login"} disabled={busy !== null} run={run("login", login)} />
          </div>
          <p className="cs-switch">
            New device?{" "}
            <button type="button" className="cs-link" disabled={busy !== null} onClick={() => void (location.href = "/console/pair")}>
              I have an invite code
            </button>
          </p>
        </div>
      ) : mode === "demo" ? (
        <div className="cs-form">
          <div className="cs-list">
            <DoorRow
              lead={<KanjiLead k="証" />}
              label="Create a passkey to try it"
              line="No invite and no account: a passkey for this demo only"
              busy={busy === "new"}
              disabled={busy !== null}
              run={run("new", async () => {
                const start = await post<{ ceremony: string; options: { publicKey: Record<string, unknown> } }>("/node/console/pair/start", { code: "" });
                let cred: PublicKeyCredential;
                try {
                  cred = (await navigator.credentials.create({ publicKey: creationOptions(start.options.publicKey) })) as PublicKeyCredential;
                } catch (e) {
                  throw e instanceof DOMException && e.name === "NotAllowedError" ? new Error("The passkey was not created.") : e;
                }
                await post("/node/console/pair/finish", { ceremony: start.ceremony, credential: registrationJson(cred) });
              })}
            />
            <DoorRow lead={<KeyLead />} label="I tried it before" line="Continue with the passkey you made here" busy={busy === "back"} disabled={busy !== null} run={run("back", login)} />
          </div>
        </div>
      ) : mode === "unpaired" ? (
        <div className="cs-form">
          <p className="cs-switch">
            <button type="button" className="cs-link" onClick={() => void (location.href = "/console/pair")}>
              I have an invite code
            </button>
          </p>
        </div>
      ) : null}
      <Message msg={msg} />
      <LockLine />
    </DoorPage>
  );
}

/** The node did not answer this page: no light under the door. */
export function NoAnswer({ error }: { error: string }): ReactNode {
  const door = useDoor();
  return (
    <DoorPage
      net={null}
      eyebrow="Financier console"
      title="The node did not answer"
      lede={error}
      visCap="No light under the door: the node behind it did not answer this page."
      door={<Door door={door} lock="waiting" cap="No answer from behind the door" capKanji="無" name={keptName()} facts={null} room="" silent />}
    >
      {/* judge run 2: an installed console has no reload button; ask the node again from here */}
      <button className="cs-btn is-wide" type="button" onClick={() => location.reload()}>
        Ask the node again
      </button>
    </DoorPage>
  );
}
