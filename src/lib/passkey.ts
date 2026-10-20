// Role master secret from a passkey (WebAuthn PRF extension): no seed phrase, nothing stored.
// The same passkey on any synced device gives the same 32 bytes, so the same keys. Each role has
// its own salt (P-02), so one passkey gives isolated buyer and supplier masters.

import { hex } from "./core";

export type PasskeyRole = "buyer" | "supplier";

async function salt(role: PasskeyRole): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jitsuin/${role}/master/v1`));
}

function random(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

export function passkeysAvailable(): boolean {
  return typeof window.PublicKeyCredential !== "undefined" && window.isSecureContext;
}

/// Creates a passkey for this site with the PRF extension enabled.
export async function createPasskey(): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "JitsuinFi" },
      user: { id: random(16), name: "jitsuinfi", displayName: "JitsuinFi" },
      challenge: random(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const ext = cred?.getClientExtensionResults() as PrfResults | undefined;
  if (!ext?.prf?.enabled) {
    throw new Error("this authenticator does not support the PRF extension; use a test secret instead");
  }
}

/// Asks the passkey for the PRF output under the role's salt: that role's master secret (32 bytes).
/// Pass it to the jitsuin-wasm `*Bytes` functions, which zero it.
export async function masterBytesFromPasskey(role: PasskeyRole): Promise<Uint8Array> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      userVerification: "required",
      extensions: { prf: { eval: { first: await salt(role) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const out = (cred?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first;
  if (!out) throw new Error("no PRF output from the passkey; use a test secret instead");
  return new Uint8Array(out);
}

/// The buyer's master secret (hex), for the buyer screen.
export async function masterFromPasskey(): Promise<string> {
  return hex(await masterBytesFromPasskey("buyer"));
}
