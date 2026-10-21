// The node provider's public keys (HNK-26.T25, D-46 B): financier applications are sealed to its
// mailbox, and the invite that comes back must be signed by its key. Made with
// `jitsuin-node provider init`; the provider key itself stays on the provider's machine.
export const PROVIDER = {
  mailbox_pk: "69c842daeffbe7c1f337158f223d9b6c98789a0ad72752da02fc1ad4080fd02e",
  signer_pk: "48eebdb1265d23d0a93bc563b875a6b5440a0e6567db3b91ad7f80a437ded4ec",
} as const;

/** An invite link the applicant may open: a JitsuinFi console pairing link. */
export function inviteLinkOk(link: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === "https:" && /^jitsuinfi-console[a-z0-9-]*\.vercel\.app$/.test(u.hostname) && u.pathname === "/console/pair" && u.hash.length > 1;
  } catch {
    return false;
  }
}
