// The financier node's API as the console sees it (HNK-26.T21, D-45): every call goes to /node/*
// on this origin, which Vercel forwards to the financier's node. Base64url helpers turn the
// WebAuthn options of the node (webauthn-rs JSON) into browser types and back.

export class NodeError extends Error {
  /** The node's JSON answer and status, for a refusal that carries more than words (wave 5: pay preflight). */
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status = 0, body: unknown = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new NodeError(j.error || `the node answered ${r.status}`);
  return j;
}

export async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new NodeError(j.error || `the node answered ${r.status}`, r.status, j);
  return j;
}

/** A GET that also says the status (the wallet: 404 on a node from before it). */
export async function getRaw(path: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(path, { credentials: "same-origin" });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export async function del(path: string): Promise<void> {
  const r = await fetch(path, { method: "DELETE", credentials: "same-origin" });
  if (!r.ok) throw new NodeError(((await r.json().catch(() => ({}))) as { error?: string }).error || `the node answered ${r.status}`);
}

function fromB64u(s: string): ArrayBuffer {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

function toB64u(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Json = Record<string, unknown>;

export function creationOptions(pk: Json): PublicKeyCredentialCreationOptions {
  const user = pk.user as Json;
  return {
    ...(pk as unknown as PublicKeyCredentialCreationOptions),
    challenge: fromB64u(pk.challenge as string),
    user: { ...(user as unknown as PublicKeyCredentialUserEntity), id: fromB64u(user.id as string) },
    excludeCredentials: ((pk.excludeCredentials as Json[] | undefined) ?? []).map((c) => ({ ...(c as unknown as PublicKeyCredentialDescriptor), id: fromB64u(c.id as string) })),
  };
}

export function requestOptions(pk: Json): PublicKeyCredentialRequestOptions {
  return {
    ...(pk as unknown as PublicKeyCredentialRequestOptions),
    challenge: fromB64u(pk.challenge as string),
    allowCredentials: ((pk.allowCredentials as Json[] | undefined) ?? []).map((c) => ({ ...(c as unknown as PublicKeyCredentialDescriptor), id: fromB64u(c.id as string) })),
  };
}

export function registrationJson(cred: PublicKeyCredential): Json {
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64u(cred.rawId),
    type: cred.type,
    response: { attestationObject: toB64u(r.attestationObject), clientDataJSON: toB64u(r.clientDataJSON), transports: r.getTransports?.() },
    extensions: cred.getClientExtensionResults(),
  };
}

export function assertionJson(cred: PublicKeyCredential): Json {
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64u(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: toB64u(r.authenticatorData),
      clientDataJSON: toB64u(r.clientDataJSON),
      signature: toB64u(r.signature),
      userHandle: r.userHandle ? toB64u(r.userHandle) : null,
    },
    extensions: cred.getClientExtensionResults(),
  };
}

/** A fresh passkey assertion for a node challenge (sign-in or payment approval). */
export async function assert(startPath: string, finishPath: string, body: unknown = {}): Promise<Json> {
  const start = await post<{ ceremony: string; options: { publicKey: Json } }>(startPath, body);
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({ publicKey: requestOptions(start.options.publicKey) })) as PublicKeyCredential;
  } catch (e) {
    throw new NodeError(e instanceof DOMException && e.name === "NotAllowedError" ? "The passkey was not used." : "This browser could not use the passkey.");
  }
  return post<Json>(finishPath, { ceremony: start.ceremony, credential: assertionJson(cred) });
}

/** Payment approval (HNK-26.T15): one-time approval id for this exact intent. */
export async function approvePayment(intent: { n: string; amount_zat: number; address: string }): Promise<string> {
  const r = (await assert("/node/console/approve/start", "/node/console/approve/finish", intent)) as { approval: string };
  return r.approval;
}

/** Fund close approval (HNK-30.T23): one-time approval id for the exact plan the node made. */
export async function approvePlan(planId: string): Promise<string> {
  const r = (await assert("/node/console/approve/start", "/node/console/approve/finish", { plan: planId })) as { approval: string };
  return r.approval;
}

/** The fingerprint inside a node's contact card (jitsuin-contact-v1:base64url(JSON)). */
export function contactFingerprint(contact: string): string {
  const json = new TextDecoder().decode(fromB64u(contact.slice("jitsuin-contact-v1:".length)));
  return (JSON.parse(json) as { fingerprint: string }).fingerprint;
}
