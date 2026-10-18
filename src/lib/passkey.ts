// Buyer master secret from a passkey (WebAuthn PRF extension): no seed phrase, nothing stored.
// The same passkey on any synced device gives the same 32 bytes, so the same buyer keys.

import { hex } from "./core";

const SALT_LABEL = "jitsuin/buyer/master/v1";

async function salt(): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT_LABEL));
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
      user: { id: random(16), name: "jitsuinfi-buyer", displayName: "JitsuinFi buyer" },
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

/// Asks the passkey for the PRF output under JitsuinFi's salt: the buyer's master secret (hex).
export async function masterFromPasskey(): Promise<string> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      userVerification: "required",
      extensions: { prf: { eval: { first: await salt() } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const out = (cred?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first;
  if (!out) throw new Error("no PRF output from the passkey; use a test secret instead");
  return hex(new Uint8Array(out));
}
