// Console home (HNK-26.T3, T4, T20, D-45): sign in with the paired passkey; signed in, the
// financier mailbox read through the node, adding devices, and the node's public facts.
import { h } from "../lib/ui";
import { assert, contactFingerprint, del, get, NodeError, post } from "./node";
import { fact, sheet, verdict } from "./sheet";

interface Session {
  signed_in: boolean;
  paired: boolean;
  console: boolean;
}

interface Info {
  network: string;
  financier_pk: string;
  mailbox_id: string;
  wallet_address: string;
  contact: string;
}

interface Mail {
  relay_id: string;
  received_at: string;
  type: string;
  from?: { role?: string };
  n?: string;
  signer?: string | null;
  signature_ok: boolean;
  attachments?: Array<{ name: string; size: number }>;
}

// Message types (relay-message.ts) in the operator's words, and the role seals of the app.
const TYPE_LABEL: Record<string, string> = {
  "deal.offer": "Financing offer",
  "deal.entry": "Board entry",
  "deal.seal": "Seal",
  "history.chain": "Buyer history",
  "invoice.signature": "Buyer signature",
  "key.invoice_pk": "Invoice key",
  "invoice.sign_request": "Signing request",
};
const ROLE_BADGE: Record<string, string> = { supplier: "売", buyer: "買", fund: "資", member: "資", financier: "証" };

const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-8)}` : s);

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const kib = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

function mailbox(): HTMLElement {
  const list = h("ul", { class: "mail-list" });
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const load = async () => {
    note.textContent = "Opening sealed messages…";
    try {
      const j = await get<{ messages: Mail[]; refused: number }>("/node/mail");
      list.replaceChildren(...j.messages.map(row));
      const refused = j.refused ? ` ${j.refused} could not be opened or were addressed elsewhere.` : "";
      note.textContent = j.messages.length ? refused.trim() : `No messages.${refused}`;
    } catch (e) {
      note.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  const row = (m: Mail): HTMLElement => {
    const signed = m.signer !== undefined && m.signer !== null;
    const line = h("span", { class: "mail-line" }, `from ${m.from?.role ?? "?"} · ${ago(m.received_at)}`);
    if (m.n) line.append(" · N ", h("span", { class: "is-mono" }, short(m.n)));
    const actions = h("div", { class: "mail-actions" });
    (m.attachments ?? []).forEach((a, i) => actions.append(h("a", { href: `/node/mail/${encodeURIComponent(m.relay_id)}/attachments/${i}`, download: "" }, `${a.name} (${kib(a.size)})`)));
    const remove = h("button", { type: "button" }, "Remove") as HTMLButtonElement;
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await del(`/node/mail/${encodeURIComponent(m.relay_id)}`);
        await load();
      } catch (e) {
        note.textContent = e instanceof Error ? e.message : String(e);
        remove.disabled = false;
      }
    });
    actions.append(remove);
    return h(
      "li",
      { class: "mail-row" },
      h("span", { class: "mail-badge", "aria-hidden": "true" }, ROLE_BADGE[m.from?.role ?? ""] ?? "外"),
      h("span", { class: "mail-what" }, TYPE_LABEL[m.type] ?? m.type),
      signed ? h("span", { class: m.signature_ok ? "mail-verdict" : "mail-verdict is-bad", title: m.signature_ok ? "Signature holds" : "Signature does not hold" }, m.signature_ok ? "認" : "拒") : h("span", {}),
      line,
      actions,
    );
  };
  const refresh = h("button", { class: "auth-link", type: "button" }, "Refresh");
  refresh.addEventListener("click", load);
  void load();
  return h("section", { class: "mail", "aria-labelledby": "mail-title" }, h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "mail-title" }, "Mailbox"), refresh), list, note);
}

function devices(): HTMLElement {
  const link = h("p", { class: "invite-link is-mono" });
  const copy = h("button", { class: "auth-link", type: "button" }, "Copy link");
  const note = h("p", { class: "mail-note" });
  const invite = h("div", { class: "invite", hidden: true }, h("p", { class: "mail-note" }, "Open this link on the new device within 15 minutes. It works once."), link, copy, note);
  const add = h("button", { class: "auth-link", type: "button" }, "Add a device");
  add.addEventListener("click", async () => {
    try {
      const r = await post<{ link: string }>("/node/console/devices/code");
      link.textContent = r.link;
      invite.hidden = false;
    } catch (e) {
      note.textContent = e instanceof Error ? e.message : String(e);
      invite.hidden = false;
    }
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link.textContent ?? "");
      copy.textContent = "Copied";
    } catch {
      getSelection()?.selectAllChildren(link);
    }
  });
  return h("section", { class: "mail", "aria-labelledby": "devices-title" }, h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "devices-title" }, "Devices"), add), invite);
}

export async function homeView(rerender: () => void): Promise<HTMLElement> {
  const s = sheet("Financier console", "Sign in with the passkey paired to this node.");
  const [session, info] = await Promise.all([get<Session>("/node/console/session"), get<Info>("/node/info")]);
  fact(s.facts, "Network", info.network === "main" ? "Zcash mainnet" : "Zcash testnet");
  fact(s.facts, "Node key", contactFingerprint(info.contact), true);

  if (session.signed_in) {
    s.lede.textContent = "This node's keys and wallet stay on the node.";
    fact(s.facts, "Mailbox", short(info.mailbox_id), true, info.mailbox_id);
    fact(s.facts, "Wallet", short(info.wallet_address), true, info.wallet_address);
    s.body.append(verdict("認", "Signed in", "The session ends after 8 hours, or when the node restarts."), mailbox(), devices());
    const out = h("button", { class: "auth-link", type: "button" }, "Sign out");
    out.addEventListener("click", async () => {
      await post("/node/console/logout").catch(() => undefined);
      rerender();
    });
    s.foot.prepend(out);
    return s.root;
  }

  const msg = h("p", { class: "auth-msg", role: "status", "aria-live": "polite" });
  if (!session.console) {
    msg.textContent = "The console is off on this node.";
    s.body.append(msg);
    return s.root;
  }
  if (!session.paired) {
    s.lede.textContent = "No passkey is paired with this console yet. Open the invite link from your node provider.";
    return s.root;
  }
  const go = h("button", { class: "auth-button is-primary", type: "button" }, "Sign in with passkey") as HTMLButtonElement;
  go.addEventListener("click", async () => {
    go.disabled = true;
    go.classList.add("is-waiting");
    msg.textContent = "";
    try {
      await assert("/node/console/login/start", "/node/console/login/finish");
      rerender();
    } catch (e) {
      msg.textContent = e instanceof NodeError || e instanceof Error ? e.message : String(e);
    } finally {
      go.disabled = false;
      go.classList.remove("is-waiting");
    }
  });
  s.body.append(h("div", { class: "auth-form" }, go, msg));
  return s.root;
}
