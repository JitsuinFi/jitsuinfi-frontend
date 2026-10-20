// Passkey with the WebAuthn PRF extension (HNK-22.T1, T2; SEQ-00): no seed phrase, nothing secret
// stored. One passkey per person; each role asks it for its own salts (P-02), so one passkey gives
// isolated supplier, buyer and fund member keys. The same passkey on any synced device gives the
// same PRF output, so the same keys.
//
// PRF `first` (role master salt) is the role master; PRF `second` (inbox salt) seeds the inbox
// key. Outputs are returned as `Uint8Array`; the caller zeroes them (jitsuin-wasm `*Bytes`
// functions do so).

import { fromB64url, inboxSalt, masterSalt, rpIdFor, toB64url, type Role } from "./account";

/** The authenticator made a credential but cannot give PRF output: no keys can come from it. */
export class NoPrfError extends Error {}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer; second?: ArrayBuffer } } };

export interface PrfOutput {
  credentialId: string;
  first: Uint8Array;
  second: Uint8Array;
}

function random(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

function rpId(): string {
  return rpIdFor(location.hostname);
}

export function passkeysAvailable(): boolean {
  return typeof window.PublicKeyCredential !== "undefined" && window.isSecureContext;
}

function readable(e: unknown): Error {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "InvalidStateError") return new Error("this device already has your JitsuinFi passkey: sign in with it instead");
  if (name === "NotAllowedError") return new Error("the passkey prompt was cancelled or timed out");
  if (name === "SecurityError") return new Error("passkeys are not allowed on this address (use https or localhost)");
  return e instanceof Error ? e : new Error(String(e));
}

async function evalSalts(role: Role): Promise<{ first: ArrayBuffer; second: ArrayBuffer }> {
  return { first: await masterSalt(role), second: await inboxSalt(role) };
}

function outputs(credentialId: string, ext: PrfResults | undefined): PrfOutput | null {
  const r = ext?.prf?.results;
  if (!r?.first || !r.second) return null;
  return { credentialId, first: new Uint8Array(r.first), second: new Uint8Array(r.second) };
}

/**
 * Creates the person's passkey (once: `excludeCredentials` lists the credentials this browser
 * knows). The name is "JitsuinFi" for every role. Returns the PRF output for `role` when the
 * authenticator gives it at creation, otherwise `null` (then call `evaluatePrf`).
 */
export async function registerPasskey(role: Role, known: string[]): Promise<{ credentialId: string; out: PrfOutput | null }> {
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId(), name: "JitsuinFi" },
        user: { id: random(16), name: "JitsuinFi", displayName: "JitsuinFi" },
        challenge: random(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        excludeCredentials: known.map((id) => ({ type: "public-key", id: fromB64url(id) })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        extensions: { prf: { eval: await evalSalts(role) } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw readable(e);
  }
  if (!cred) throw new Error("no passkey was created");
  const credentialId = toB64url(new Uint8Array(cred.rawId));
  const ext = cred.getClientExtensionResults() as PrfResults;
  if (!ext.prf?.enabled) {
    // Tell the password manager this credential is useless, where supported (orphan clean-up).
    const pkc = PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> };
    await pkc.signalUnknownCredential?.({ rpId: rpId(), credentialId }).catch(() => undefined);
    throw new NoPrfError(
      "this passkey provider cannot derive keys (no PRF support). Delete the passkey named \"JitsuinFi\" it just saved, then try another provider or use test data.",
    );
  }
  return { credentialId, out: outputs(credentialId, ext) };
}

/**
 * Asks the passkey for `role`'s PRF output (one touch). `allow` limits the prompt to known
 * credentials; empty lets the user pick any JitsuinFi passkey (a new device, cleared storage).
 */
export async function evaluatePrf(role: Role, allow: string[]): Promise<PrfOutput> {
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        rpId: rpId(),
        challenge: random(32),
        userVerification: "required",
        allowCredentials: allow.map((id) => ({ type: "public-key", id: fromB64url(id) })),
        extensions: { prf: { eval: await evalSalts(role) } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw readable(e);
  }
  if (!cred) throw new Error("no passkey was used");
  const out = outputs(toB64url(new Uint8Array(cred.rawId)), cred.getClientExtensionResults() as PrfResults);
  if (!out) throw new NoPrfError("this passkey gave no PRF output, so no keys can come from it. Use test data on this device.");
  return out;
}
