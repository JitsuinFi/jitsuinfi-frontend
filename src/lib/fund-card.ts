// The fund's card (HNK-30.T22): what a fund manager hands a new member, like a contact card: the
// fund's signing key (its receipts and paths are signed with it), its mailbox, and a deposit
// address made for this member. `jitsuin-fund-v1:` ‖ base64url(JSON). Pure: tests run it under Node.

export const FUND_CARD_PREFIX = "jitsuin-fund-v1:";

export interface FundCard {
  v: 1;
  fund_pk: string;
  mailbox_pk: string;
  deposit_address: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function encodeFundCard(c: FundCard): string {
  return FUND_CARD_PREFIX + b64url(JSON.stringify(c));
}

export function decodeFundCard(code: string): FundCard {
  const t = code.trim();
  if (!t.startsWith(FUND_CARD_PREFIX)) throw new Error("this is not a JitsuinFi fund card");
  let j: Partial<FundCard>;
  try {
    j = JSON.parse(unb64url(t.slice(FUND_CARD_PREFIX.length))) as Partial<FundCard>;
  } catch {
    throw new Error("this fund card is damaged: copy it again, whole");
  }
  if (j.v !== 1 || !HEX64.test(j.fund_pk ?? "") || !HEX64.test(j.mailbox_pk ?? "") || !/^[0-9a-z]{10,512}$/.test(j.deposit_address ?? "")) {
    throw new Error("this fund card is incomplete");
  }
  return { v: 1, fund_pk: j.fund_pk!, mailbox_pk: j.mailbox_pk!, deposit_address: j.deposit_address! };
}
