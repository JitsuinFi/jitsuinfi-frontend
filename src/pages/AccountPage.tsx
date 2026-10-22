// Account screen (HNK-22.T1 – T3; SEQ-00): sign up, log in, onboarding, role switch, log out.
// Demo mode (test secret) only where passkeys cannot give keys.
//
// Look: a consumer login sheet in JitsuinFi's palette.
// - Sign up: email, username and role, then the passkey (the password), then a short onboarding
//   (what the passkey is, the key fingerprint, the first step for the role).
// - Log in: username, then the passkey. The first role opened is the one used last.
// No account server exists yet (relay HNK-23): username and email stay in this browser's profile
// (D-34). The passkey is named after the username, so a synced passkey finds the account on a new
// device. React since HNK-31.T7.
import { useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Page } from "../app/AppShell";
import { AuthForm, AuthLink, Check, Chevron, FingerIcon, Head, KeyIcon, LockIcon, PasskeyIcon, Primary, Row, Sheet, SheetButton, SyncIcon, useMessage } from "../app/auth";
import { emailProblem, isNonProductionHost, normalizeUsername, PRODUCTION_RP_ID, roleLabel, ROLES, usernameProblem, type Role } from "../lib/account";
import { account } from "../lib/app-session";
import { NoPrfError, passkeysAvailable } from "../lib/passkey";
import { SealCard, type SheetView } from "./SealCard";
// stylesheet: loaded with the app shell (src/app/legacy-main.ts), in its old place in the cascade

// ---------- screen state (this tab only) ----------
type View = "login" | "login-passkey" | "signup" | "signup-passkey";
let view: View | null = null;
let loginName = "";
let draft: { email: string; username: string; role: Role } = { email: "", username: "", role: "supplier" };
let onboarding = false;
// The device's authenticator turned out to have no PRF, so offer test data.
let prfFailed = false;
const onboardingListeners = new Set<() => void>();
const setOnboarding = (v: boolean) => {
  onboarding = v;
  onboardingListeners.forEach((f) => f());
};

const KANJI: Record<Role, string> = { supplier: "売", buyer: "買", member: "資" };
const ROLE_LINE: Record<Role, string> = {
  supplier: "Issue invoices and get them financed",
  buyer: "Sign invoices and pay when they are due",
  member: "See what the fund holds for you",
};
const FIRST_STEP: Record<Role, { label: string; line: string }> = {
  supplier: { label: "Create your first invoice", line: "Then ask your buyer to sign it." },
  buyer: { label: "Share your invoice key", line: "Your supplier needs it to address an invoice to you." },
  member: { label: "Open your inbox", line: "Receipts from the fund arrive here." },
};

/** True right after sign-up, until the onboarding sheet is left: the router keeps showing it. */
export function onboardingPending(): boolean {
  return onboarding && account.current !== null;
}

/** Repaints on every session change and when the onboarding sheet is left. */
export function useSessionGate(): void {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useLayoutEffect(() => {
    onboardingListeners.add(bump);
    const off = account.onChange(bump);
    return () => {
      onboardingListeners.delete(bump);
      off();
    };
  }, []);
}

export function rolePath(role: Role): string {
  return `/${role}`;
}

function bytesFromHex(s: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(s)) throw new Error("a test secret is 64 hex characters");
  return Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
}

/** `want`: the role screen the user tried to open. */
export function AccountPage({ want }: { want?: Role }): ReactNode {
  // The sheet sits on the registry counter beside the seal registration card (HNK-30.T15).
  useSessionGate();
  const [, paint] = useReducer((x: number) => x + 1, 0);
  const [typed, setTyped] = useState<SheetView>({ username: "", role: "", carving: false });
  return (
    <Page>
      <section className="auth reg">
        <div className="reg-sheet">
          <SheetFor want={want} paint={paint} onView={setTyped} />
        </div>
        <SealCard view={typed} />
      </section>
    </Page>
  );
}

type Paint = () => void;
type OnView = (v: SheetView) => void;

function SheetFor({ want, paint, onView }: { want?: Role; paint: Paint; onView: OnView }): ReactNode {
  if (account.current) return onboarding ? <OnboardingSheet paint={paint} onView={onView} /> : <RolesSheet want={want} onView={onView} />;
  if (!view) view = account.knownCredentials().length ? "login" : "signup";
  if (want && view === "signup" && !draft.username) draft.role = want;
  switch (view) {
    case "login":
      return <LoginSheet key="login" paint={paint} onView={onView} />;
    case "login-passkey":
      return <LoginPasskeySheet key="login-passkey" want={want} paint={paint} onView={onView} />;
    case "signup":
      return <SignupSheet key="signup" paint={paint} onView={onView} />;
    case "signup-passkey":
      return <SignupPasskeySheet key="signup-passkey" paint={paint} onView={onView} />;
  }
}

/** Tells the seal card what this sheet shows (what the old card read from the sheet's DOM). */
function useView(onView: OnView, v: SheetView): void {
  useLayoutEffect(() => onView(v), [onView, v.username, v.role, v.carving]);
}

// ---------- pieces ----------

function Badge({ role }: { role: Role }): ReactNode {
  return (
    <span className="auth-badge" aria-hidden="true">
      {KANJI[role]}
    </span>
  );
}

/** `error`: undefined before the first check, null when the value passed. */
function AuthField({ label, help, error, children }: { label: string; help?: string; error: string | null | undefined; children: ReactNode }): ReactNode {
  return (
    <label className="auth-field">
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
      <small className="auth-field-error">{error ?? ""}</small>
    </label>
  );
}

function Footer(): ReactNode {
  return (
    <div className="auth-foot">
      <p className="auth-protected">
        <LockIcon />
        Protected by your device passkey
      </p>
      {isNonProductionHost(location.hostname) ? <p className="auth-host">{`Passkeys made on ${location.hostname} are separate from ${PRODUCTION_RP_ID}.`}</p> : null}
    </div>
  );
}

function Demo({ role, failed }: { role: Role; failed: boolean }): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  const msg = useMessage();
  const open = !passkeysAvailable() || failed;
  return (
    <details className="auth-demo" hidden={passkeysAvailable() && !failed} open={open}>
      <summary>Use test data instead</summary>
      <div className="auth-demo-body">
        <input type="text" placeholder="64 hex characters" spellCheck="false" autoComplete="off" aria-label="Test secret" ref={input} />
        <small>For TES- invoices only. Anyone with this secret acts as you.</small>
        <SheetButton
          className="auth-button is-secondary"
          label="Use test data"
          run={async () => {
            msg.clear();
            try {
              await account.signInDemo(role, bytesFromHex(input.current!.value.trim()));
            } catch (e) {
              msg.error(e);
            }
          }}
        />
        {msg.el}
      </div>
    </details>
  );
}

/** Runs a passkey call; a missing PRF opens the test data block. */
function usePasskey(msg: ReturnType<typeof useMessage>): { failed: boolean; run: (fn: () => Promise<unknown>) => Promise<boolean> } {
  const [failed, setFailed] = useState(prfFailed);
  return {
    failed,
    async run(fn) {
      msg.clear();
      try {
        await fn();
        return true;
      } catch (e) {
        if (e instanceof NoPrfError) {
          prfFailed = true;
          setFailed(true);
        }
        msg.error(e);
        return false;
      }
    },
  };
}

const NO_PASSKEYS = "Passkeys are not available in this browser. Open the app over https or on localhost, or use test data.";

// ---------- log in ----------

function LoginSheet({ paint, onView }: { paint: Paint; onView: OnView }): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState(loginName);
  useView(onView, { username: name.trim(), role: "", carving: false });
  useLayoutEffect(() => queueMicrotask(() => input.current?.focus()), []);
  return (
    <Sheet>
      <Head title="Log in" sub="Enter your username. Your passkey comes next." />
      <AuthForm
        onSubmit={() => {
          const v = input.current!.value;
          const problem = usernameProblem(v);
          setError(problem);
          if (problem) return;
          loginName = normalizeUsername(v);
          view = "login-passkey";
          paint();
        }}
      >
        <AuthField label="Username" error={error}>
          <input type="text" name="username" autoComplete="username webauthn" autoCapitalize="none" spellCheck="false" placeholder="yourname" defaultValue={loginName} aria-invalid={error === undefined ? undefined : error !== null} ref={input} onInput={(e) => setName(e.currentTarget.value)} />
        </AuthField>
        <Primary label="Next" submit />
      </AuthForm>
      <p className="auth-switch">
        New to JitsuinFi? <AuthLink label="Create an account" run={() => ((view = "signup"), paint())} />
      </p>
      <Footer />
    </Sheet>
  );
}

function LoginPasskeySheet({ want, paint, onView }: { want: Role | undefined; paint: Paint; onView: OnView }): ReactNode {
  const msg = useMessage();
  const pk = usePasskey(msg);
  const navigate = useNavigate();
  const role = want ?? "supplier";
  useView(onView, { username: "", role: "", carving: false });
  useLayoutEffect(() => {
    if (!passkeysAvailable()) msg.show(NO_PASSKEYS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const known = account.usernameKnown(loginName);
  return (
    <Sheet>
      <Head title="Welcome back" />
      <p className="auth-who">
        <span className="auth-chip">{`@${loginName}`}</span>
        <AuthLink label="Not you?" run={() => ((view = "login"), paint())} />
      </p>
      <p className="auth-sub is-left">{known ? "Use your passkey to log in. Your device asks for your fingerprint, your face, or your device password." : "This device has not seen this username yet. Pick the passkey you made for it; your device asks for your fingerprint, face, or device password."}</p>
      <div className="auth-list">
        <Row
          lead={<PasskeyIcon />}
          label="Continue with passkey"
          trail={<Chevron />}
          disabled={!passkeysAvailable()}
          run={async () => {
            const ok = await pk.run(() => account.signInAs(loginName, want));
            if (ok && !want && account.current) void navigate({ to: rolePath(account.current.role) });
          }}
        />
      </div>
      {msg.el}
      <Demo role={role} failed={pk.failed} />
      <Footer />
    </Sheet>
  );
}

// ---------- sign up ----------

function SignupSheet({ paint, onView }: { paint: Paint; onView: OnView }): ReactNode {
  const email = useRef<HTMLInputElement>(null);
  const user = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<{ email: string | null | undefined; user: string | null | undefined }>({ email: undefined, user: undefined });
  const [role, setRole] = useState<Role>(draft.role);
  const [name, setName] = useState(draft.username);
  useView(onView, { username: name.trim(), role, carving: false });
  return (
    <Sheet>
      <Head title="Create your account" step={1} />
      <AuthForm
        onSubmit={() => {
          const pe = emailProblem(email.current!.value);
          let pu = usernameProblem(user.current!.value);
          if (!pu && account.usernameKnown(user.current!.value)) pu = "This device already has an account with this username. Log in instead.";
          setErrors({ email: pe, user: pu });
          if (pe || pu) return;
          draft = { email: email.current!.value.trim(), username: normalizeUsername(user.current!.value), role };
          view = "signup-passkey";
          paint();
        }}
      >
        <AuthField label="Email" help="Kept on this device for now; nothing is sent until the account service is live." error={errors.email}>
          <input type="email" name="email" autoComplete="email" inputMode="email" spellCheck="false" placeholder="name@example.com" defaultValue={draft.email} aria-invalid={errors.email === undefined ? undefined : errors.email !== null} ref={email} />
        </AuthField>
        <AuthField label="Username" help="3 to 20 characters: letters, digits, dot or underscore. Your passkey is named after it." error={errors.user}>
          <input type="text" name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" placeholder="yourname" defaultValue={draft.username} aria-invalid={errors.user === undefined ? undefined : errors.user !== null} ref={user} onInput={(e) => setName(e.currentTarget.value)} />
        </AuthField>
        <fieldset className="auth-roles">
          <legend>I am a</legend>
          <div className="auth-list" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <Row key={r.role} className="auth-row is-choice" role="radio" checked={r.role === role} lead={<Badge role={r.role} />} label={r.label} line={ROLE_LINE[r.role]} trail={<Check />} run={() => setRole(r.role)} />
            ))}
          </div>
        </fieldset>
        <Primary label="Continue" submit />
      </AuthForm>
      <p className="auth-switch">
        Already have an account? <AuthLink label="Log in" run={() => ((view = "login"), paint())} />
      </p>
    </Sheet>
  );
}

function SignupPasskeySheet({ paint, onView }: { paint: Paint; onView: OnView }): ReactNode {
  const msg = useMessage();
  const pk = usePasskey(msg);
  useView(onView, { username: "", role: "", carving: true });
  useLayoutEffect(() => {
    if (!passkeysAvailable()) msg.show(NO_PASSKEYS);
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
      <Head title="Set up your passkey" sub={`For @${draft.username}. It replaces a password.`} step={2} />
      <ul className="auth-points">
        {point(<FingerIcon />, "Unlock it your way", "Your device asks for your fingerprint, your face, or your device password or PIN.")}
        {point(<KeyIcon />, "Your keys come from it", "Every signature in JitsuinFi uses keys made from this passkey on your device.")}
        {point(<SyncIcon />, "Works on your other devices", "It syncs through your device's password manager, so you can log in elsewhere.")}
      </ul>
      {msg.el}
      <Primary
        label="Create passkey"
        disabled={!passkeysAvailable()}
        run={async () => {
          // Set before the call: a new session re-renders the app at once, and that render shows onboarding.
          setOnboarding(true);
          view = null;
          const ok = await pk.run(() => account.register(draft.role, { username: draft.username, email: draft.email }));
          if (!ok) {
            setOnboarding(false);
            view = "signup-passkey";
          }
        }}
      />
      <Demo role={draft.role} failed={pk.failed} />
      <p className="auth-switch">
        <AuthLink label="Back" run={() => ((view = "signup"), paint())} />
      </p>
      <Footer />
    </Sheet>
  );
}

// ---------- onboarding (after sign-up) ----------

function OnboardingSheet({ paint, onView }: { paint: Paint; onView: OnView }): ReactNode {
  const navigate = useNavigate();
  const s = account.current!;
  const who = account.who();
  const first = FIRST_STEP[s.role];
  useView(onView, { username: "", role: "", carving: false });
  return (
    <Sheet>
      <Head title={who ? `You're set, @${who.username}` : "You're set"} sub={`You signed up as ${roleLabel(s.role)}.`} step={3} />
      <ol className="auth-onboard">
        <li>
          <strong>Your passkey is your password</strong>
          Each time you log in or sign something, your device asks for your fingerprint, face, or device password. No password to remember, nothing to back up.
        </li>
        <li>
          <strong>Your key fingerprint</strong>
          <span className="auth-print">{s.fingerprint}</span>
          It is the same on every device with this passkey. If it ever looks different, you picked another passkey.
        </li>
        <li>
          <strong>Your first step</strong>
          <div className="auth-list">
            <Row
              lead={<Badge role={s.role} />}
              label={first.label}
              line={first.line}
              trail={<Chevron />}
              run={() => {
                setOnboarding(false);
                void navigate({ to: rolePath(s.role) });
              }}
            />
          </div>
        </li>
      </ol>
      <p className="auth-switch">
        <AuthLink
          label="I'll do it later"
          run={() => {
            // Opened from a role screen: that screen shows now; from the account page: the role list.
            setOnboarding(false);
            paint();
          }}
        />
      </p>
    </Sheet>
  );
}

// ---------- signed in: pick the role ----------

function RolesSheet({ want, onView }: { want?: Role; onView: OnView }): ReactNode {
  const navigate = useNavigate();
  const s = account.current!;
  const who = account.who();
  const msg = useMessage();
  useView(onView, { username: "", role: "", carving: false });
  const pick = (r: Role) => async () => {
    msg.clear();
    if (r === s.role) {
      void navigate({ to: rolePath(r) });
      return;
    }
    try {
      await account.switchRole(r);
      void navigate({ to: rolePath(r) });
    } catch (e) {
      msg.error(e);
    }
  };
  const order = want && want !== s.role ? [want, ...ROLES.map((x) => x.role).filter((x) => x !== want)] : ROLES.map((x) => x.role);
  const facts: Array<[string, string, boolean?]> = [];
  if (who) facts.push(["Username", `@${who.username}`]);
  if (who?.email) facts.push(["Email", who.email]);
  facts.push(["Key fingerprint", s.fingerprint, true], ["Keys from", s.demo ? "Test secret (test data only)" : "Your passkey"]);
  if (s.store) facts.push(["Deals", s.store.persistent ? "On this device, encrypted" : "This tab only"]);

  return (
    <Sheet>
      <Head title={want && want !== s.role ? `Continue as ${roleLabel(want)}?` : "Choose a role"} sub="One passkey, separate keys for each role. Another role asks your passkey once." />
      <div className="auth-list">
        {order.map((r) => (
          <Row key={r} lead={<Badge role={r} />} label={roleLabel(r)} line={ROLE_LINE[r]} trail={r === s.role ? <Check /> : <Chevron />} current={r === s.role} run={pick(r)} />
        ))}
      </div>
      {msg.el}
      <dl className="auth-facts">
        {facts.flatMap(([k, v, mono]) => [
          <dt key={`k${k}`}>{k}</dt>,
          <dd key={`v${k}`} className={mono ? "is-mono" : undefined}>
            {v}
          </dd>,
        ])}
      </dl>
      <div className="auth-foot">
        <AuthLink
          label="Log out"
          run={() => {
            view = "login";
            loginName = who?.username ?? "";
            account.lock();
          }}
        />
        <p className="auth-host">Logs out by itself after 15 minutes without input.</p>
      </div>
    </Sheet>
  );
}
