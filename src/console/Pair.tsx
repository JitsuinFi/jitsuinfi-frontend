// Joining the console from an invite (HNK-26.T2, T20, D-43): the consumer sign-up of the app,
// in three steps (invite, passkey, ready). The code comes in the invite link (`/console/pair#…`,
// the fragment never reaches a server) or is typed. Pairing also signs in. React since HNK-31.T11.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AuthForm, AuthLink, Chevron, FingerIcon, Head, KeyIcon, LockIcon, Primary, Row, Sheet, useMessage } from "../app/auth";
import { keepName } from "./name";
import { creationOptions, NodeError, post, registrationJson } from "./node";

const STEPS = ["Invite", "Passkey", "Ready"];

function ProtectedNote(): ReactNode {
  return (
    <div className="auth-foot">
      <p className="auth-protected">
        <LockIcon />
        Protected by your device passkey
      </p>
      <p className="auth-host">{`Works only on ${location.host}`}</p>
    </div>
  );
}

/** The code of the invite link, read once and taken out of the address bar. */
function takeCode(): string {
  const code = decodeURIComponent(location.hash.slice(1)).trim();
  if (code) history.replaceState(null, "", location.pathname + location.search);
  return code;
}

export function Pair(): ReactNode {
  const code = useRef<string | null>(null);
  code.current ??= takeCode();
  const [step, setStep] = useState<"invite" | "passkey" | { ready: string | null }>(code.current ? "passkey" : "invite");
  return (
    <main className="auth">
      {step === "invite" ? (
        <InviteSheet
          code={code.current}
          next={(c) => {
            code.current = c;
            setStep("passkey");
          }}
        />
      ) : step === "passkey" ? (
        <PasskeySheet code={code.current} ready={(name) => setStep({ ready: name })} other={() => setStep("invite")} />
      ) : (
        <ReadySheet name={step.ready} />
      )}
    </main>
  );
}

function InviteSheet({ code, next }: { code: string; next: (code: string) => void }): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  const msg = useMessage();
  const [invalid, setInvalid] = useState(false);
  useLayoutEffect(() => queueMicrotask(() => input.current?.focus()), []);
  return (
    <Sheet>
      <Head title="Join your financier console" sub="Open the invite link, or type its code." step={1} names={STEPS} />
      <AuthForm
        onSubmit={() => {
          if (input.current!.value.replace(/[^a-z0-9]/gi, "").length < 16) {
            setInvalid(true);
            msg.show("Type the 16 characters of the invite code.");
            return;
          }
          next(input.current!.value.trim());
        }}
      >
        <label className="auth-field">
          <span>Invite code</span>
          <input className="is-code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck="false" maxLength={24} placeholder="XXXX-XXXX-XXXX-XXXX" defaultValue={code} aria-invalid={invalid ? true : undefined} ref={input} />
          <small>It is in the invite link your node provider sent you.</small>
        </label>
        <Primary label="Next" submit />
        {msg.el}
      </AuthForm>
      <ProtectedNote />
    </Sheet>
  );
}

function PasskeySheet({ code, ready, other }: { code: string; ready: (name: string | null) => void; other: () => void }): ReactNode {
  const msg = useMessage();
  const noPasskeys = !window.PublicKeyCredential;
  useLayoutEffect(() => {
    if (noPasskeys) msg.show("This browser has no passkeys. Open the invite link in a current browser.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const point = (ico: ReactNode, title: string, text: string) => (
    <li>
      {ico}
      <span>
        <strong>{title}</strong>
        {text}
      </span>
    </li>
  );
  return (
    <Sheet>
      <Head title="Set up your passkey" sub="It replaces a password for your financier console." step={2} names={STEPS} />
      <ul className="auth-points">
        {point(<FingerIcon />, "Unlock it your way", "Your device asks for your fingerprint, your face, or your device PIN.")}
        {point(<KeyIcon />, "The keys stay on your node", "The passkey opens the console. The wallet and its keys never leave the node.")}
        {point(<LockIcon />, "Every payment asks you", "An advance is paid only after you approve it with this passkey, payment by payment.")}
      </ul>
      {msg.el}
      <Primary
        label="Create passkey"
        disabled={noPasskeys}
        run={async () => {
          msg.clear();
          try {
            const start = await post<{ ceremony: string; options: { publicKey: Record<string, unknown> }; name?: string | null }>("/node/console/pair/start", { code });
            keepName(start.name);
            let cred: PublicKeyCredential;
            try {
              cred = (await navigator.credentials.create({ publicKey: creationOptions(start.options.publicKey) })) as PublicKeyCredential;
            } catch (e) {
              const why = e instanceof DOMException && e.name === "InvalidStateError" ? "This device already has a passkey for this console: log in instead." : e instanceof DOMException && e.name === "NotAllowedError" ? "The passkey was not created." : "This browser could not create the passkey.";
              throw new NodeError(`${why} Your invite code is used up; ask for a new invite link to try again.`);
            }
            const done = await post<{ credentials: number; name?: string | null }>("/node/console/pair/finish", { ceremony: start.ceremony, credential: registrationJson(cred) });
            keepName(done.name);
            ready(done.name ?? start.name ?? null);
          } catch (e) {
            msg.error(e);
          }
        }}
      />
      <p className="auth-switch">
        <AuthLink label="Use another invite code" run={other} />
      </p>
      <ProtectedNote />
    </Sheet>
  );
}

function ReadySheet({ name }: { name: string | null }): ReactNode {
  return (
    <Sheet>
      <Head title={name ? `You're set, ${name}` : "You're set"} sub="Your passkey is paired and you are signed in." step={3} names={STEPS} />
      <ol className="auth-onboard">
        <li>
          <strong>Your passkey is your password</strong>
          Each time you log in or approve a payment, your device asks for your fingerprint, face, or device PIN. Nothing to remember.
        </li>
        <li>
          <strong>More devices</strong>
          In the console, Add a device makes a one-time link for your other phone or computer.
        </li>
        <li>
          <strong>Your first step</strong>
          <div className="auth-list">
            <Row
              lead={
                <span className="auth-badge" aria-hidden="true">
                  証
                </span>
              }
              label="Open your console"
              line="Your mailbox, your devices and your node."
              trail={<Chevron />}
              run={() => void (location.href = "/console")}
            />
          </div>
        </li>
      </ol>
    </Sheet>
  );
}
