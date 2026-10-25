// Joining the console from an invite (HNK-26.T2, T20, D-43): the consumer sign-up of the app,
// in three steps (invite, passkey, ready). The code comes in the invite link (`/console/pair#…`,
// the fragment never reaches a server) or is typed. Pairing also signs in. React since HNK-31.T11;
// at the door since HNK-34.T5: the invite is a 合鍵 key tag with the code engraved on it, the
// passkey is the seal pressed into the lock, and Ready opens the door.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, FingerIcon, KeyIcon, LockIcon, PasskeyIcon, SyncIcon } from "../app/auth";
import { Door, useDoor, type DoorFacts } from "./Door";
import { netLabel } from "./bits";
import { appHref } from "../lib/hosts";
import { keepName } from "./name";
import { creationOptions, NodeError, post, registrationJson } from "./node";
import { DoorPage, DoorRow, errText, KanjiLead, LockLine, Message, type Msg } from "./SignIn";

const STEPS = ["Invite", "Passkey", "Ready"];

/** The code of the invite link, read once and taken out of the address bar. */
function takeCode(): string {
  const code = decodeURIComponent(location.hash.slice(1)).trim();
  if (code) history.replaceState(null, "", location.pathname + location.search);
  return code;
}

function Steps({ n }: { n: number }): ReactNode {
  return (
    <ol className="cs-steps" aria-label={`Step ${n} of 3`}>
      {STEPS.map((name, i) => {
        const s = i + 1;
        const done = s < n || n === 3;
        return (
          <li key={name} className={done ? "is-done" : s === n ? "is-now" : undefined}>
            <i>{done ? <Check /> : s}</i>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

function Point({ ico, title, text }: { ico: ReactNode; title: string; text: string }): ReactNode {
  return (
    <li>
      {ico}
      <span>
        <strong>{title}</strong>
        {text}
      </span>
    </li>
  );
}

export function Pair({ info }: { info: DoorFacts | null }): ReactNode {
  const first = useRef<string | null>(null);
  first.current ??= takeCode();
  const [code, setCode] = useState(first.current);
  const [step, setStep] = useState<"invite" | "passkey" | "ready">(first.current ? "passkey" : "invite");
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [used, setUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const door = useDoor();
  const noPasskeys = typeof window.PublicKeyCredential === "undefined";

  useLayoutEffect(() => {
    if (step === "invite") queueMicrotask(() => input.current?.focus());
    if (step === "passkey" && noPasskeys) setMsg({ text: "This browser has no passkeys. Open the invite link in a current browser." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const start = await post<{ ceremony: string; options: { publicKey: Record<string, unknown> }; name?: string | null }>("/node/console/pair/start", { code });
      keepName(start.name);
      let cred: PublicKeyCredential;
      try {
        cred = (await navigator.credentials.create({ publicKey: creationOptions(start.options.publicKey) })) as PublicKeyCredential;
      } catch (e) {
        const why = e instanceof DOMException && e.name === "InvalidStateError" ? "This device already has a passkey for this console: log in instead." : e instanceof DOMException && e.name === "NotAllowedError" ? "The passkey was not created." : "This browser could not create the passkey.";
        setUsed(true);
        throw new NodeError(`${why} Your invite code is used up; ask for a new invite link to try again.`);
      }
      const done = await post<{ credentials: number; name?: string | null }>("/node/console/pair/finish", { ceremony: start.ceremony, credential: registrationJson(cred) });
      keepName(done.name);
      setName(done.name ?? start.name ?? null);
      await door.press();
      setStep("ready");
    } catch (e) {
      setMsg({ text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const view = {
    invite: {
      title: "Join your financier console",
      lede: "Open the invite link, or type its code.",
      visCap: "The invite is a one-time key tag for this door. With it, your device sets the seal that opens it from now on.",
    },
    passkey: {
      title: "Set up your passkey",
      lede: "It replaces a password for your financier console.",
      visCap: "Creating the passkey presses your seal into this lock. The wallet and its keys stay behind the door, on the node.",
    },
    ready: {
      title: name ? `You're set, ${name}` : "You're set",
      lede: "Your passkey is paired and you are signed in.",
      visCap: opening ? "Opening your console…" : "Paired and signed in. The door stays yours: next time your passkey opens it.",
    },
  }[step];

  return (
    <DoorPage
      net={netLabel(info?.network)}
      eyebrow="Join the console"
      title={view.title}
      lede={view.lede}
      visCap={view.visCap}
      door={
        <Door
          door={door}
          lock={step === "invite" ? "empty" : "waiting"}
          empty="Your seal is set in the next step"
          capKanji={step === "invite" ? "鍵" : "刻"}
          cap={step === "invite" ? "The invite code lets you set your seal" : "Your device carves this seal into a passkey"}
          name={name}
          facts={info}
          room="Your mailbox, your devices and your node. Every payment waits for your passkey."
          tag={step === "ready" ? null : code}
          tagUsed={used}
          ready={step === "ready"}
        />
      }
    >
      <Steps n={step === "invite" ? 1 : step === "passkey" ? 2 : 3} />
      {step === "invite" ? (
        <form
          className="cs-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (code.replace(/[^a-z0-9]/gi, "").length < 16) {
              setInvalid(true);
              setMsg({ text: "Type the 16 characters of the invite code." });
              return;
            }
            setMsg(null);
            setUsed(false);
            setCode(code.trim());
            setStep("passkey");
          }}
        >
          <label className="cs-field">
            <span>Invite code</span>
            <input
              className="cs-code-in"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck="false"
              maxLength={24}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={code}
              aria-invalid={invalid ? true : undefined}
              aria-describedby="cs-code-help"
              ref={input}
              onChange={(e) => {
                setCode(e.target.value);
                setInvalid(false);
              }}
            />
            <small id="cs-code-help">It is in the invite link your node provider sent you.</small>
          </label>
          <button className="cs-btn is-wide" type="submit">
            Next
          </button>
          {/* no dead end (nav audit 2026-10-25): no invite yet, or back to the door */}
          <p className="cs-switch cs-pair-out">
            No invite yet? <a className="cs-link" href={appHref("/apply", location.hostname)}>Apply as a financier</a>
            <span aria-hidden="true"> · </span>
            <a className="cs-link" href="/console">
              Back to log in
            </a>
          </p>
        </form>
      ) : step === "passkey" ? (
        <div className="cs-form">
          <ul className="cs-points">
            <Point ico={<FingerIcon />} title="Unlock it your way" text="Your device asks for your fingerprint, your face, or your device PIN." />
            <Point ico={<KeyIcon />} title="The keys stay on your node" text="The passkey opens the console. The wallet and its keys never leave the node." />
            <Point ico={<LockIcon />} title="Every payment asks you" text="An advance is paid only after you approve it with this passkey, payment by payment." />
          </ul>
          <button className={`cs-btn is-wide${busy ? " is-busy" : ""}`} type="button" disabled={noPasskeys || busy} onClick={() => void create()}>
            <PasskeyIcon />
            Create passkey
          </button>
          <p className="cs-switch">
            <button
              type="button"
              className="cs-link"
              disabled={busy}
              onClick={() => {
                setMsg(null);
                setStep("invite");
              }}
            >
              Use another invite code
            </button>
          </p>
        </div>
      ) : (
        <div className="cs-form">
          <ul className="cs-points">
            <Point ico={<PasskeyIcon />} title="Your passkey is your password" text="Each time you log in or approve a payment, your device asks for your fingerprint, face, or device PIN. Nothing to remember." />
            <Point ico={<SyncIcon />} title="More devices" text="In the console, Add a device makes a one-time link for your other phone or computer." />
          </ul>
          <div className="cs-list">
            <DoorRow
              lead={<KanjiLead k="証" />}
              label="Open your console"
              line="Your mailbox, your devices and your node."
              busy={opening}
              disabled={opening}
              run={() => {
                setOpening(true);
                location.href = "/console";
              }}
            />
          </div>
        </div>
      )}
      <Message msg={msg} />
      {step === "ready" ? null : <LockLine />}
    </DoorPage>
  );
}
