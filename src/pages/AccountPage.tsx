// Account screen (HNK-22.T1 – T3; SEQ-00): sign up, sign in, onboarding, role switch, log out.
// Demo mode (test secret) only where passkeys cannot give keys.
//
// Look (HNK-34.T5, approved sample design-samples/internal/account.html): the seal registration
// card 印鑑登録証 IS the form. The username and email are written on its lines, the role chooses
// the seal (売 supplier, 買 buyer, 資 fund member), Create passkey presses that seal on the card's
// seat, and the registration number is the passkey's real key fingerprint. Every view lives on
// the card; the caption carries the title, the checked stepper and the points.
// - Sign up: email, username and role, then the passkey (the password), then a short onboarding
//   (what the passkey is, the key fingerprint, the first step for the role).
// - Sign in: username, then the passkey. The first role opened is the one used last.
// No account server exists yet (relay HNK-23): username and email stay in this browser's profile
// (D-34). The passkey is named after the username, so a synced passkey finds the account on a new
// device. React since HNK-31.T7.
// Nav audit 2026-10-25: the nav's Sign in opens log-in on a device that knows an account and
// sign-up on one that does not; test data shows the same Ready step as a passkey sign-up; a role
// screen's gate names its counter; Use test data instead is always under the passkey step.
import { useLayoutEffect, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Page } from "../app/AppShell";
import { Dock } from "../app/Dock";
import { Lede } from "../app/Lede";
import { emailProblem, isNonProductionHost, normalizeUsername, PRODUCTION_RP_ID, roleLabel, ROLES, usernameProblem, type Role } from "../lib/account";
import { account, accountDoor } from "../lib/app-session";
import { dropMyDrafts } from "../app/kept";
import { firstSection } from "../lib/sections";
import { NoPrfError, passkeysAvailable } from "../lib/passkey";
import { onboarding } from "../lib/onboarding";
import { dur, ease, run, still } from "./try/anim";
// stylesheet: src/pages/account.css, loaded with the app shell (src/app/app-styles.ts)

// ---------- screen state (this tab only) ----------
type View = "login" | "login-passkey" | "signup" | "signup-passkey";
type CardView = View | "onboard" | "roles";
let view: View | null = null;
let loginName = "";
let draft: { email: string; username: string; role: Role } = { email: "", username: "", role: "supplier" };
// The device's authenticator turned out to have no PRF, so offer test data.
let prfFailed = false;
// The next session to appear was made by Create passkey: the hanko comes down on the seat.
let pressNext = false;
const setOnboarding = (v: boolean) => onboarding.set(v);

const KANJI: Record<Role, string> = { supplier: "売", buyer: "買", member: "資" };
const ROLE_LINE: Record<Role, string> = {
  supplier: "Issue invoices and get them financed",
  buyer: "Sign invoices and pay when they are due",
  member: "See what the fund holds for you",
};
// judge run 2: a new supplier starts by sharing its contact (link or QR) with the buyer, who
// sends its invoice key back; then the invoice is written
const FIRST_STEP: Record<Role, { label: string; line: string; to?: string }> = {
  supplier: { label: "Share my contact with the buyer", line: "A link or QR. The buyer adds you and sends their key.", to: "/supplier/contacts?share=1" },
  buyer: { label: "Share your invoice key", line: "Your supplier needs it to address an invoice to you." },
  member: { label: "Open your inbox", line: "Receipts from the fund arrive here." },
};
const NO_PASSKEYS = "Passkeys are not available in this browser. Open the app over https or on localhost, or use test data.";
const JITSUIN = "Your passkey is your jitsuin: a seal only your device can press.";
const REGISTERED = "Registered. Your passkey signs for you; JitsuinFi never sees it.";

/**
 * True right after sign-up, until the onboarding view is left: the router keeps showing it. Any
 * move to another screen leaves it (src/lib/onboarding.ts, audit 2026-10-27 finding 1).
 */
export function onboardingPending(): boolean {
  return onboarding.on && account.current !== null;
}

/** Repaints on every session change and when the onboarding view is left. */
export function useSessionGate(): void {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useLayoutEffect(() => {
    const offStep = onboarding.subscribe(bump);
    const off = account.onChange(bump);
    return () => {
      offStep();
      off();
    };
  }, []);
}

/** IA port 2026-10-26: sign-in, a role switch and onboarding land on the role's first section. */
export function rolePath(role: Role): string {
  return firstSection(role);
}

function bytesFromHex(s: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(s)) throw new Error("a test secret is 64 hex characters");
  return Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
}

const sentence = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.charAt(0).toUpperCase() + m.slice(1);
};

// ---------- line icons ----------

const Tick = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.5 12.5l4 4 9-9" />
  </svg>
);
const PasskeyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx={9} cy={8} r={3.5} />
    <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5 1.2 0 2.3.3 3.2.8" />
    <circle cx={17.5} cy={13.5} r={2.5} />
    <path d="M17.5 16v5M17.5 18.5h2M17.5 20.5h1.5" />
  </svg>
);
const FingerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 20c1-2 1.5-4.2 1.5-7a2.5 2.5 0 0 1 5 0c0 1.6-.2 3.2-.6 4.7M12 13c0 3.2-.6 5.6-1.8 7.6M5.5 16.5c.6-1.2 1-2.6 1-4.3a5.5 5.5 0 0 1 11 0c0 .8 0 1.6-.1 2.4M16.5 19.5c.3-.8.5-1.6.7-2.5" />
  </svg>
);
const KeyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx={8} cy={12} r={3.5} />
    <path d="M11.5 12H21M18 12v3M15 12v2" />
  </svg>
);
const SyncIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 8a7.5 7.5 0 0 0-13.4-1.6M5 16a7.5 7.5 0 0 0 13.4 1.6M5 4v3.5h3.5M19 20v-3.5h-3.5" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x={5} y={10.5} width={14} height={9.5} rx={2} />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);

// ---------- caption pieces ----------

/** Sign-up progress, checked: account, passkey, ready. */
function Steps({ n }: { n: number }): ReactNode {
  return (
    <ol className="ac-steps" aria-label={`Step ${n} of 3`}>
      {["Account", "Passkey", "Ready"].map((name, i) => {
        const done = i + 1 < n || (n === 3 && i === 2);
        return (
          <li key={name} className={done ? "is-done" : i + 1 === n ? "is-now" : undefined} aria-current={i + 1 === n ? "step" : undefined}>
            <i>{done ? <Tick /> : i + 1}</i>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): ReactNode {
  return (
    <li>
      {icon}
      <span>
        <strong>{title}</strong>
        {children}
      </span>
    </li>
  );
}

/** A hash that resolves into place: each glyph cycles a few base32 glyphs, left to right. */
function Resolve({ text, className }: { text: string; className?: string }): ReactNode {
  const el = useRef<HTMLElement>(null);
  const shown = useRef<string | null>(null);
  useLayoutEffect(() => {
    const node = el.current!;
    const first = shown.current === null;
    shown.current = text;
    if (first || still() || !/^[A-Z2-7-]+$/.test(text)) {
      node.textContent = text;
      return;
    }
    const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const chars = [...text];
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      let out = "";
      let done = true;
      chars.forEach((c, i) => {
        const local = now - t0 - i * 20;
        if (c === "-" || local >= dur.enter) out += c;
        else {
          done = false;
          out += local < 0 ? " " : B32[(Math.random() * 32) | 0];
        }
      });
      node.textContent = out;
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node.textContent = text;
    };
  }, [text]);
  return <b className={className} ref={el} />;
}

// ---------- the page ----------

type Say = { mk: string; text: string; bad?: boolean };

/**
 * Mobile E2E 2026-10-27 (B-04 → B-06): a contact link opened signed out. The sign-up names the
 * person who shared it, and the Ready step's primary adds them (the link's card is held in memory
 * by ContactLinkPage.tsx), instead of a role's first step that dropped the card.
 */
export interface SharedCard {
  /** "@supplier" (or their fingerprint). */
  name: string;
  /** Keeps the card on this device; the contact screen then shows it added. */
  add: () => Promise<void>;
}

/** `want`: the role screen the user tried to open. `shared`: a contact link waits behind the sign-up. */
export function AccountPage({ want, shared }: { want?: Role; shared?: SharedCard }): ReactNode {
  useSessionGate();
  const [, paint] = useReducer((x: number) => x + 1, 0);
  const navigate = useNavigate();
  const router = useRouter(); // a first step with a search (?share=1) goes by href
  const s = account.current;

  if (accountDoor.fresh) {
    accountDoor.fresh = false;
    if (!s) view = null;
  }
  let v: CardView;
  if (s) v = onboarding.on ? "onboard" : "roles";
  else {
    if (!view) {
      // after a reload "Welcome back" keeps the username this browser used last (mobile E2E 2026-10-27)
      const last = account.knownCredentials().length ? account.lastUsername() : null;
      if (last && !loginName) loginName = last;
      view = last ? "login-passkey" : account.knownCredentials().length ? "login" : "signup";
    }
    if (want && view === "signup" && !draft.username) draft.role = want;
    v = view;
  }
  const go = (next: View) => {
    view = next;
    paint();
  };

  // what the seal says: a per-view line, or the last thing that happened in this view
  const [said, setSaid] = useState<(Say & { v: CardView }) | null>(null);
  const say = (x: Say) => setSaid({ ...x, v });
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(prfFailed);
  const [role, setRole] = useState<Role>(draft.role);
  // messy-state E2E 2026-10-27: a sign-in this browser cannot place (a new device with the same
  // passkey, or test data) asks which counter to open instead of opening Supplier by itself
  const [loginRole, setLoginRole] = useState<Role>(() => account.lastRole() ?? "supplier");
  // the lines marked on the card, for the view they were checked in
  const [marks, setMarks] = useState<{ v: CardView; email?: string | null; user?: string | null }>({ v });
  const errors = marks.v === v ? marks : { v };
  const setErrors = (x: { email?: string | null; user?: string | null }) => setMarks({ ...x, v });

  const userIn = useRef<HTMLInputElement>(null);
  const emailIn = useRef<HTMLInputElement>(null);
  const secret = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLFormElement>(null);
  const hanko = useRef<HTMLDivElement>(null);
  const imp = useRef<SVGSVGElement>(null);

  /** Runs one action; every control of the card waits while it runs. */
  const act = async (id: string, fn: () => Promise<void> | void) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  /** Runs a passkey call; a missing PRF opens the test data block. */
  const passkey = async (fn: () => Promise<unknown>): Promise<boolean> => {
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof NoPrfError) {
        prfFailed = true;
        setFailed(true);
      }
      say({ mk: "拒", text: sentence(e), bad: true });
      return false;
    }
  };

  // the log-in view puts the cursor on the username
  useLayoutEffect(() => {
    if (v === "login") queueMicrotask(() => userIn.current?.focus());
  }, [v]);

  // a new session: Create passkey brings the hanko down on the seat; a log-in only shows the seal
  const sessionKey = s ? `${s.role}:${s.fingerprint}` : null;
  const lastKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    const before = lastKey.current;
    lastKey.current = sessionKey;
    if (!sessionKey || sessionKey === before) return;
    const pressing = pressNext;
    pressNext = false;
    if (still() || !imp.current) return;
    const i = imp.current;
    if (!pressing) {
      void run(i, { scale: [1.12, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
      return;
    }
    const h = hanko.current!;
    const dy = matchMedia("(max-width: 760px)").matches ? 34 : 44;
    void (async () => {
      i.classList.add("is-wait");
      h.classList.add("is-on");
      await run(h, { y: [-40, 0], opacity: [0, 1], duration: dur.enter }, ease.softLand);
      await run(h, { y: [0, dy], duration: dur.seal }, ease.snapSettle);
      i.classList.remove("is-wait");
      void run(i, { scale: [1.12, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
      if (card.current) void run(card.current, { y: [0, 2, 0], duration: 180 }, ease.softLand);
      await run(h, { y: [dy, -60], opacity: [1, 0], duration: dur.exit }, ease.accelExit);
      h.classList.remove("is-on");
    })();
  }, [sessionKey]);

  const pickRole = (r: Role) => {
    if (r === role) return;
    setRole(r);
    if (imp.current && !still()) void run(imp.current, { opacity: [0.2, 1], rotate: [-8, 0], scale: [0.94, 1], duration: dur.enter }, ease.softLand);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (v === "signup") {
      const em = emailIn.current!.value;
      const us = userIn.current!.value;
      const pe = emailProblem(em);
      let pu = usernameProblem(us);
      if (!pu && account.usernameKnown(us)) pu = "This device already has an account with this username. Sign in instead.";
      setErrors({ email: pe, user: pu });
      if (pe || pu) {
        say({ mk: "拒", text: "Check the lines marked on the card.", bad: true });
        return;
      }
      draft = { email: em.trim(), username: normalizeUsername(us), role };
      go("signup-passkey");
    } else if (v === "login") {
      const us = userIn.current!.value;
      const pu = usernameProblem(us);
      setErrors({ user: pu });
      if (pu) return;
      loginName = normalizeUsername(us);
      go("login-passkey");
    }
  };

  const createPasskey = () =>
    act("create", async () => {
      say({ mk: "刻", text: "Your device asks for your fingerprint, your face, or your device password." });
      // Set before the call: a new session re-renders the app at once, and that render shows onboarding.
      setOnboarding(true);
      pressNext = true;
      const ok = await passkey(() => account.register(draft.role, { username: draft.username, email: draft.email }));
      if (ok) view = null;
      else {
        pressNext = false;
        setOnboarding(false);
      }
    });

  const logIn = () =>
    act("login", async () => {
      const ok = await passkey(() => account.signInAs(loginName, want ?? (askRole ? loginRole : undefined)));
      if (ok && !want && account.current) void navigate({ to: rolePath(account.current.role) });
    });

  const testData = (r: Role) =>
    act("demo", async () => {
      // A new test-data account gets the Ready step a passkey sign-up gets: from sign-up, and from
      // the account page itself. A log-in from a role screen's gate opens that screen.
      const onboard = v === "signup-passkey" || !want;
      let key: Uint8Array;
      try {
        key = bytesFromHex(secret.current!.value.trim());
      } catch (e) {
        say({ mk: "拒", text: sentence(e), bad: true });
        return;
      }
      // set before the call: the new session re-renders the app at once (as Create passkey does)
      if (onboard) setOnboarding(true);
      try {
        // the name and email typed on the card stay with the test-data session (finding 5)
        const typed = v === "signup-passkey" && draft.username ? { username: draft.username, email: draft.email } : v === "login-passkey" && loginName ? { username: loginName } : undefined;
        await account.signInDemo(r, key, typed);
        view = null;
      } catch (e) {
        if (onboard) setOnboarding(false);
        say({ mk: "拒", text: sentence(e), bad: true });
      }
    });

  const switchTo = (r: Role) =>
    act(`role:${r}`, async () => {
      if (!s) return;
      if (r === s.role) {
        say({ mk: KANJI[r], text: `Opening the ${roleLabel(r)} screen.` });
        void navigate({ to: rolePath(r) });
        return;
      }
      say({ mk: KANJI[r], text: `Your passkey opens the ${roleLabel(r)} keys once, then the ${roleLabel(r)} screen.` });
      try {
        await account.switchRole(r);
        void navigate({ to: rolePath(r) });
      } catch (e) {
        say({ mk: "拒", text: sentence(e), bad: true });
      }
    });

  const who = s ? account.who() : null;
  const pk = passkeysAvailable();
  /** The login-passkey view asks for the role: no role screen asked, and this browser does not know the username (or has no passkeys). */
  const askRole = v === "login-passkey" && !want && (!pk || !account.usernameKnown(loginName));
  const fixed = v === "signup-passkey" || v === "onboard";
  const seatRole: Role | null = s ? s.role : v === "signup" ? role : v === "signup-passkey" ? draft.role : null;
  const seat: "blank" | "carved" | "pressed" = s ? "pressed" : seatRole ? "carved" : "blank";
  const wantOther = s && want && want !== s.role ? want : null;
  // always offered under the passkey step; open by itself when passkeys cannot give keys here
  const showDemo = v === "signup-passkey" || v === "login-passkey";
  const demoOpen = !pk || failed;
  const demoRole: Role = v === "signup-passkey" ? draft.role : (want ?? loginRole);

  // caption
  let title: string;
  let lede: string;
  let step = 0;
  switch (v) {
    case "signup":
      title = shared ? `${shared.name} shared their contact` : want ? `Sign in to open the ${roleLabel(want)} counter` : "Create your account";
      lede = shared
        ? `Sign up to add them. Write your name on the card${want ? `; the ${roleLabel(want)} seal is chosen` : ""}. Have an account? Sign in.`
        : want
          ? `New here? Write your name on the card; the ${roleLabel(want)} seal is chosen. Have an account? Sign in.`
          : `${JITSUIN} Write your name on the card and choose the seal you sign with.`;
      step = 1;
      break;
    case "signup-passkey":
      title = "Set up your passkey";
      lede = `For @${draft.username}. It replaces a password.`;
      step = 2;
      break;
    case "onboard":
      title = who ? `You're set, @${who.username}` : "You're set";
      lede = shared ? `You signed up as ${roleLabel(s!.role)}. ${shared.name}'s contact is waiting to be added.` : `You signed up as ${roleLabel(s!.role)}.`;
      step = 3;
      break;
    case "login":
      title = shared ? `${shared.name} shared their contact` : want ? `Sign in to open the ${roleLabel(want)} counter` : "Sign in";
      lede = shared ? "Sign in to add them. Enter your username; your passkey comes next." : "Enter your username. Your passkey comes next.";
      break;
    case "login-passkey":
      title = "Welcome back";
      lede = shared
        ? `Use your passkey to sign in and add ${shared.name}.`
        : account.usernameKnown(loginName)
        ? "Use your passkey to sign in. Your device asks for your fingerprint, your face, or your device password."
        : "This device has not seen this username yet. Choose the counter to open, then pick the passkey you made for it; your device asks for your fingerprint, face, or device password.";
      break;
    case "roles":
      title = wantOther ? `Continue as ${roleLabel(wantOther)}?` : "Choose a role";
      lede = "One passkey, separate keys for each role. Another role asks your passkey once.";
      break;
  }

  // what the seal says
  let line: Say;
  if (said && said.v === v) line = said;
  else if ((v === "signup-passkey" || v === "login-passkey") && !pk) line = { mk: "拒", text: NO_PASSKEYS, bad: true };
  else if (v === "signup-passkey") line = { mk: "刻", text: "Your device is about to carve this seal into a passkey." };
  else if (v === "login-passkey") line = { mk: "印", text: "Your seal is on your device. Press it to sign in." };
  else if (s) line = { mk: "登", text: REGISTERED };
  else line = { mk: "印", text: JITSUIN };

  const writtenUser = v === "signup-passkey" ? draft.username : (who?.username ?? null);
  const writtenEmail = v === "signup-passkey" ? draft.email : who?.email;
  const ink = v === "signup-passkey" ? " ac-ink" : "";
  const lock = busy !== null;
  const first: { label: string; line: string; to?: string } | null = s ? (shared ? { label: `Add ${shared.name}`, line: "Their contact card came with the link; one tap keeps it on this device." } : FIRST_STEP[s.role]) : null;

  return (
    <Page wide>
      <div className="ac">
        <section className="ac-sec" aria-labelledby="ac-title">
          {/* caption: ≤ 35% */}
          <div className="ac-cap">
            <p className="ac-eyebrow">
              {/* 印, the Sign in tab's kanji: 登 is Home's (audit 2026-10-27, finding 10) */}
              <span className="ac-stamp" lang="ja" aria-hidden="true">
                印
              </span>
              Seal registration
            </p>
            <h1 id="ac-title">{title}</h1>
            <Lede className="ac-lede">{lede}</Lede>
            {step ? <Steps n={step} /> : null}
            {v === "signup-passkey" ? (
              <ul className="ac-points">
                <Point icon={<FingerIcon />} title="Unlock it your way">
                  Your device asks for your fingerprint, your face, or your device password or PIN.
                </Point>
                <Point icon={<KeyIcon />} title="Your keys come from it">
                  Every signature in JitsuinFi uses keys made from this passkey on your device.
                </Point>
                <Point icon={<SyncIcon />} title="Works on your other devices">
                  It syncs through your device's password manager, so you can sign in elsewhere.
                </Point>
              </ul>
            ) : null}
            {v === "onboard" && s ? (
              <ul className="ac-points">
                {s.demo ? (
                  <Point icon={<KeyIcon />} title="Test data stands in for a passkey">
                    Your keys come from the test secret, for TES- invoices only. Anyone with it acts as you; a passkey replaces it on a real account.
                  </Point>
                ) : (
                  <Point icon={<PasskeyIcon />} title="Your passkey is your password">
                    Each time you sign in or sign something, your device asks for your fingerprint, face, or device password. No password to remember, nothing to back up.
                  </Point>
                )}
                <Point icon={<FingerIcon />} title="Your key fingerprint">
                  <span className="ac-fp">{s.fingerprint}</span>
                  It is the same on every device with this passkey. If it ever looks different, you picked another passkey.
                </Point>
              </ul>
            ) : null}
            <p className="ac-lock">
              <LockIcon />
              Protected by your device passkey
            </p>
            {isNonProductionHost(location.hostname) ? <p className="ac-host">{`Passkeys made on ${location.hostname} are separate from ${PRODUCTION_RP_ID}.`}</p> : null}
          </div>

          {/* the visual: ≥ 65% */}
          <div className="ac-desk">
            <form className={`ac-card${fixed ? " is-fixed" : ""}${s ? " is-registered" : ""}${v === "signup" || v === "login" ? " has-fields" : ""}`} noValidate aria-labelledby="ac-card-title" onSubmit={submit} ref={card}>
              <span className="ac-band" aria-hidden="true" />
              <div className="ac-head">
                <p className="ac-title" id="ac-card-title">
                  <b lang="ja">印鑑登録証</b>
                  <small>Seal registration card · JitsuinFi</small>
                </p>
                <p className="ac-no">
                  <span lang="ja">
                    登録番号<small>Registration no.</small>
                  </span>
                  <Resolve text={s ? s.fingerprint : "not yet registered"} />
                </p>
              </div>

              <div className="ac-body">
                <div className="ac-lines">
                  {/* 氏名: username */}
                  <div className={`ac-ln${errors.user ? " is-bad" : ""}`}>
                    {v === "signup" || v === "login" ? (
                      <label className="ac-lab" htmlFor="ac-user">
                        <b lang="ja">氏名</b>
                        <small>Username</small>
                      </label>
                    ) : (
                      <span className="ac-lab">
                        <b lang="ja">氏名</b>
                        <small>Username</small>
                      </span>
                    )}
                    {v === "signup" || v === "login" ? (
                      <div className="ac-write">
                        <span className="ac-at" aria-hidden="true">
                          @
                        </span>
                        <input
                          key={v}
                          id="ac-user"
                          ref={userIn}
                          type="text"
                          name="username"
                          autoComplete={v === "login" ? "username webauthn" : "username"}
                          autoCapitalize="none"
                          spellCheck="false"
                          placeholder="yourname"
                          maxLength={24}
                          defaultValue={v === "login" ? loginName : draft.username}
                          disabled={lock}
                          aria-invalid={errors.user === undefined ? undefined : errors.user !== null}
                          aria-describedby={v === "signup" ? "ac-user-help ac-user-err" : "ac-user-err"}
                          onInput={() => errors.user && setErrors({ ...errors, user: null })}
                        />
                      </div>
                    ) : v === "login-passkey" ? (
                      <div className="ac-who">
                        <span className="ac-chip">{`@${loginName}`}</span>
                        <button type="button" className="ac-link" disabled={lock} onClick={() => go("login")}>
                          Not you?
                        </button>
                      </div>
                    ) : (
                      <div className="ac-write">
                        {writtenUser ? (
                          <>
                            <span className="ac-at" aria-hidden="true">
                              @
                            </span>
                            <span className={`ac-written${ink}`}>{writtenUser}</span>
                          </>
                        ) : (
                          <span className="ac-written is-quiet">{s?.demo ? "Test data, no username" : "Not given"}</span>
                        )}
                      </div>
                    )}
                    <div className="ac-note">
                      {v === "signup" ? <small id="ac-user-help">3 to 20 characters: letters, digits, dot or underscore. Your passkey is named after it.</small> : null}
                      <small className="ac-err" id="ac-user-err" role="alert">
                        {errors.user ?? ""}
                      </small>
                    </div>
                  </div>

                  {/* 連絡先: email (sign-up only; kept on this device) */}
                  {v !== "login" && v !== "login-passkey" ? (
                    <div className={`ac-ln${errors.email ? " is-bad" : ""}`}>
                      {v === "signup" ? (
                        <label className="ac-lab" htmlFor="ac-email">
                          <b lang="ja">連絡先</b>
                          <small>Email</small>
                        </label>
                      ) : (
                        <span className="ac-lab">
                          <b lang="ja">連絡先</b>
                          <small>Email</small>
                        </span>
                      )}
                      <div className="ac-write">
                        {v === "signup" ? (
                          <input
                            id="ac-email"
                            ref={emailIn}
                            className="is-email"
                            type="email"
                            name="email"
                            autoComplete="email"
                            inputMode="email"
                            spellCheck="false"
                            placeholder="name@example.com"
                            defaultValue={draft.email}
                            disabled={lock}
                            aria-invalid={errors.email === undefined ? undefined : errors.email !== null}
                            aria-describedby="ac-email-help ac-email-err"
                            onInput={() => errors.email && setErrors({ ...errors, email: null })}
                          />
                        ) : (
                          <span className={`ac-written is-email${ink}`}>{writtenEmail || "Not given"}</span>
                        )}
                      </div>
                      <div className="ac-note">
                        {v === "signup" ? <small id="ac-email-help">Kept on this device for now; nothing is sent until the account service is live.</small> : null}
                        <small className="ac-err" id="ac-email-err" role="alert">
                          {errors.email ?? ""}
                        </small>
                      </div>
                    </div>
                  ) : null}

                  {/* 資格: the role chooses the seal (and, signing in on a new device, the counter it opens) */}
                  {(v !== "login" && v !== "login-passkey") || askRole ? (
                    <div className="ac-ln is-role">
                      <span className="ac-lab" id="ac-role-lab">
                        <b lang="ja">資格</b>
                        <small>{v === "roles" ? "Your roles" : v === "signup" ? "I am a" : askRole ? "Open as" : "Role"}</small>
                      </span>
                      {v === "roles" && s ? (
                        <div className="ac-seals" role="group" aria-labelledby="ac-role-lab">
                          {ROLES.map(({ role: r, label }) => (
                            <button key={r} type="button" className={`ac-sl${r === s.role ? " is-on" : ""}${busy === `role:${r}` ? " is-busy" : ""}`} aria-current={r === s.role ? "true" : undefined} disabled={lock} onClick={() => void switchTo(r)}>
                              <span className="ac-tick" aria-hidden="true">
                                <Tick />
                              </span>
                              <span className="ac-face" lang="ja" aria-hidden="true">
                                {KANJI[r]}
                              </span>
                              <strong>{label}</strong>
                              <small>{ROLE_LINE[r]}</small>
                              <span className="ac-go">{r === s.role ? "Open" : wantOther === r ? "Continue here" : "Switch, asks your passkey"}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="ac-seals" role="radiogroup" aria-labelledby="ac-role-lab">
                          {ROLES.map(({ role: r, label }) => {
                            const on = r === (v === "signup" ? role : askRole ? loginRole : seatRole);
                            return (
                              <button key={r} type="button" role="radio" className={`ac-sl${on ? " is-on" : ""}`} aria-checked={on} aria-disabled={fixed || undefined} disabled={lock} onClick={() => (v === "signup" ? pickRole(r) : askRole && setLoginRole(r))}>
                                <span className="ac-tick" aria-hidden="true">
                                  <Tick />
                                </span>
                                <span className="ac-face" lang="ja" aria-hidden="true">
                                  {KANJI[r]}
                                </span>
                                <strong>{label}</strong>
                                <small>{ROLE_LINE[r]}</small>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* 印影: the key fingerprint */}
                  <div className="ac-ln">
                    <span className="ac-lab">
                      <b lang="ja">印影</b>
                      <small>Key fingerprint</small>
                    </span>
                    <div className="ac-write" aria-live="polite">
                      {s ? <Resolve className="ac-written is-mono" text={s.fingerprint} /> : <span className="ac-written is-quiet">Made by your device. It never leaves it.</span>}
                    </div>
                  </div>

                  {/* signed in: where the keys and deals live */}
                  {v === "roles" && s ? (
                    <>
                      <div className="ac-ln">
                        <span className="ac-lab">
                          <b lang="ja">鍵</b>
                          <small>Keys from</small>
                        </span>
                        <div className="ac-write">
                          <span className="ac-written is-email">{s.demo ? "Test secret (test data only)" : "Your passkey"}</span>
                        </div>
                      </div>
                      {s.store ? (
                        <div className="ac-ln">
                          <span className="ac-lab">
                            <b lang="ja">保管</b>
                            <small>Deals</small>
                          </span>
                          <div className="ac-write">
                            <span className="ac-written is-email">{s.store.persistent ? "On this device, encrypted" : "This tab only"}</span>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>

                {/* 登録印: the seat */}
                <div className="ac-seat">
                  <div className="ac-seat-box">
                    {seat === "blank" ? <span className="ac-seat-empty">Your seal is pressed here</span> : null}
                    <svg className={`ac-imp${seat === "carved" ? " is-carved" : seat === "blank" ? " is-blank" : ""}`} viewBox="0 0 144 144" aria-hidden="true" ref={imp}>
                      <defs>
                        <filter id="ac-wear" x="-10%" y="-10%" width="120%" height="120%">
                          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={4} result="n" />
                          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.55" result="m" />
                          <feComposite in="SourceGraphic" in2="m" operator="in" />
                        </filter>
                      </defs>
                      <g filter="url(#ac-wear)">
                        <circle className="ring" cx={72} cy={72} r={64} />
                        <text x={72} y={97}>
                          {seatRole ? KANJI[seatRole] : ""}
                        </text>
                      </g>
                    </svg>
                    <div className="ac-hanko" aria-hidden="true" ref={hanko}>
                      <svg viewBox="0 0 84 150">
                        <ellipse cx={42} cy={14} rx={17} ry={13} fill="#502A50" />
                        <rect x={33} y={22} width={18} height={10} fill="#461D3A" />
                        <rect x={18} y={30} width={48} height={104} rx={9} fill="#461D3A" />
                        <rect x={25} y={38} width={5} height={86} rx={2.5} fill="#BA71A2" opacity={0.38} />
                        <rect x={18} y={126} width={48} height={16} rx={3} fill="#7E2A53" />
                        <rect x={22} y={141} width={40} height={4} rx={2} fill="#6B2347" />
                      </svg>
                    </div>
                  </div>
                  <p className="ac-seat-cap">
                    <b lang="ja">登録印</b>
                    <small>{seat === "pressed" ? (s?.demo ? "Registered seal · test data" : "Registered seal · your passkey") : seat === "carved" ? "Carved, not yet pressed" : "Registered seal"}</small>
                  </p>
                </div>
              </div>

              <div className="ac-foot">
                <p className={`ac-say${line.bad ? " is-bad" : ""}`} role="status" aria-live="polite">
                  <span className="ac-mk" lang="ja" aria-hidden="true">
                    {line.mk}
                  </span>
                  <span>{line.text}</span>
                </p>
                {v === "signup" ? (
                  <div className="ac-act">
                    <p className="ac-switch">
                      Already have an account?{" "}
                      <button type="button" className="ac-link" onClick={() => go("login")}>
                        Sign in
                      </button>
                    </p>
                    <button className="ac-btn" type="submit">
                      Continue
                    </button>
                  </div>
                ) : v === "signup-passkey" ? (
                  <div className="ac-act">
                    <button type="button" className="ac-link" disabled={lock} onClick={() => go("signup")}>
                      Back
                    </button>
                    {/* mobile E2E 3: nothing to write on this step, so a phone has the primary in the bottom bar (thumb zone) */}
                    <Dock label="Passkey">
                      <button className={`ac-btn${busy === "create" ? " is-busy" : ""}`} type="button" disabled={!pk || lock} onClick={() => void createPasskey()}>
                        <PasskeyIcon />
                        Create passkey
                      </button>
                    </Dock>
                  </div>
                ) : v === "onboard" && s && first ? (
                  <div className="ac-act">
                    {/* the next step's line beside the buttons, so the primary is one height (audit 2026-10-27, finding 16) */}
                    <p className="ac-next">{first.line}</p>
                    <button
                      type="button"
                      className="ac-btn2 ac-later"
                      onClick={() => {
                        // Opened from a role screen: that screen shows now; from the account page: the role list.
                        setOnboarding(false);
                        paint();
                      }}
                    >
                      I'll do it later
                    </button>
                    {/* mobile E2E 3: the Ready step's primary rides in the phone's bottom bar */}
                    <Dock label="Ready">
                      <button
                        className={`ac-btn${busy === "first" ? " is-busy" : ""}`}
                        type="button"
                        disabled={lock}
                        aria-busy={busy === "first" || undefined}
                        onClick={() =>
                          void act("first", async () => {
                            if (shared) {
                              // the contact screen comes back with the card added and its next step
                              try {
                                await shared.add();
                              } catch (e) {
                                say({ mk: "拒", text: sentence(e), bad: true });
                                return;
                              }
                              setOnboarding(false);
                              return;
                            }
                            setOnboarding(false);
                            void router.navigate({ href: first.to ?? rolePath(s.role) });
                          })
                        }
                      >
                        {first.label}
                      </button>
                    </Dock>
                  </div>
                ) : v === "login" ? (
                  <div className="ac-act">
                    <p className="ac-switch">
                      New to JitsuinFi?{" "}
                      <button type="button" className="ac-link" onClick={() => go("signup")}>
                        Create an account
                      </button>
                    </p>
                    <button className="ac-btn" type="submit">
                      Next
                    </button>
                  </div>
                ) : v === "login-passkey" ? (
                  <div className="ac-act">
                    <button className={`ac-btn${busy === "login" ? " is-busy" : ""}`} type="button" disabled={!pk || lock} onClick={() => void logIn()}>
                      <PasskeyIcon />
                      Continue with passkey
                    </button>
                  </div>
                ) : (
                  <div className="ac-act">
                    <span className="ac-switch">Signs you out by itself after 15 minutes without input.</span>
                    <button
                      type="button"
                      className="ac-link"
                      disabled={lock}
                      onClick={() => {
                        view = "login";
                        loginName = who?.username ?? "";
                        void dropMyDrafts();
                        account.lock();
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </form>

            {showDemo ? (
              <details className="ac-demo" open={demoOpen}>
                <summary>Use test data instead</summary>
                <div className="ac-demo-body">
                  <input type="text" placeholder="64 hex characters" spellCheck="false" autoComplete="off" aria-label="Test secret" ref={secret} disabled={lock} />
                  <button type="button" className={`ac-btn2${busy === "demo" ? " is-busy" : ""}`} disabled={lock} onClick={() => void testData(demoRole)}>
                    Use test data
                  </button>
                  <small>For TES- invoices only. Anyone with this secret acts as you.</small>
                </div>
              </details>
            ) : null}
          </div>
        </section>
      </div>
    </Page>
  );
}
