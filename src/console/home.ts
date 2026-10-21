// Console home (HNK-26.T3, T4, T20, D-45): sign in with the paired passkey; signed in, the
// financier mailbox read through the node, adding devices, and the node's public facts.
// Financing offers in the mailbox are checked by the node and accepted here (HNK-26.T5); buyer
// histories are flagged against the financier's KYC registry of buyers (HNK-26.T7).
import { chevron, head, link, lockIcon, Message, passkeyIcon, row, sheet as authSheet } from "../lib/auth-sheet";
import { h } from "../lib/ui";
import { keepName, keptName } from "./name";
import { approvePayment, approvePlan, assert, contactFingerprint, creationOptions, del, get, post, registrationJson } from "./node";
import { fact, seal } from "./sheet";
import "./desk.css";

interface Session {
  signed_in: boolean;
  paired: boolean;
  console: boolean;
  name?: string | null;
  /** The judges' demo console (HNK-26.T26): no invite, nothing that moves money. */
  demo?: boolean;
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
  /** A `deal.offer` as the node checked it (HNK-26.T5). */
  offer?: Offer;
  /** A `history.chain`: whether its identity key is in the KYC registry (HNK-26.T7). */
  identity?: { registered: boolean; label?: string; missing?: boolean };
}

interface Offer {
  ok: boolean;
  problem?: string;
  n?: string;
  invoice_id?: string;
  amount_zat?: number;
  due_date?: number;
  advance_zat?: number;
  supplier_address?: string;
  accepted?: { advance_zat: number; min_confirmations: number; accepted_at: number } | null;
  /** HNK-30.T11: the offer against the private mandate, checked on the node. */
  mandate?: { verdict: "fits" | "breaks" | "waiting" | "none"; rules: Array<{ rule: string; ok: boolean | null; detail: string }>; decline_reason: string };
}

// ZEC amounts without the wasm bundle (core.ts): the console stays small.
const zec = (zat: number) => (zat / 1e8).toFixed(8).replace(/\.?0+$/, "");
const zat = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error("the advance must be a positive number of ZEC");
  return Math.round(n * 1e8);
};
const dueDay = (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10);

/** The offer under its mailbox row: checked terms and the accept form, or why it is refused. */
function offerBlock(relayId: string, o: Offer, demo: boolean, reload: () => Promise<void>): HTMLElement {
  if (!o.ok) return h("p", { class: "offer-problem" }, `Refused by the node: ${o.problem}. Nothing was saved.`);
  const facts = h(
    "dl",
    { class: "offer-facts" },
    h("dt", {}, "Invoice"), h("dd", {}, o.invoice_id ?? ""),
    h("dt", {}, "Amount"), h("dd", {}, `${zec(o.amount_zat ?? 0)} ZEC`),
    h("dt", {}, "Due"), h("dd", {}, dueDay(o.due_date ?? 0)),
    h("dt", {}, "Advance asked"), h("dd", {}, `${zec(o.advance_zat ?? 0)} ZEC`),
  );
  const checked = h("p", { class: "mail-note offer-checked" }, "The supplier's key signed this offer and the buyer signed this exact invoice.");
  if (o.accepted) {
    return h(
      "div",
      { class: "offer" },
      facts,
      h("p", { class: "offer-done" }, `Accepted: ${zec(o.accepted.advance_zat)} ZEC after ${o.accepted.min_confirmations} confirmation${o.accepted.min_confirmations === 1 ? "" : "s"}. The supplier has your commitment opening.`),
    );
  }
  // the private mandate's verdict, rule by rule: 適 fits, 外 breaks, 待 waiting for the buyer
  const m = o.mandate;
  const rules =
    m && m.verdict !== "none"
      ? h(
          "ul",
          { class: `offer-rules is-${m.verdict}` },
          ...m.rules.map((r) => h("li", { "data-ok": String(r.ok) }, h("b", { lang: "ja", "aria-hidden": "true" }, r.ok === true ? "適" : r.ok === false ? "外" : "待"), h("span", {}, `${r.rule}: ${r.detail}`))),
        )
      : null;
  if (demo) return h("div", { class: "offer" }, facts, checked, rules);
  const advance = h("input", { inputmode: "decimal", value: zec(o.advance_zat ?? 0) }) as HTMLInputElement;
  const confirmations = h("input", { inputmode: "numeric", value: "1" }) as HTMLInputElement;
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const submit = h("button", { class: "auth-link", type: "submit" }, "Accept offer") as HTMLButtonElement;
  const form = h(
    "form",
    { class: "offer-form" },
    h("label", { class: "auth-field" }, h("span", {}, "Advance you pay (ZEC)"), advance, h("small", {}, "Up to what the supplier asked.")),
    h("label", { class: "auth-field" }, h("span", {}, "Confirmations"), confirmations, h("small", {}, "Blocks the board entry waits before you pay.")),
    submit,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const c = Number(confirmations.value);
      if (!Number.isInteger(c) || c < 1) throw new Error("confirmations must be a whole number, at least 1");
      await post(`/node/console/offers/${encodeURIComponent(relayId)}/accept`, { advance_zat: zat(advance.value), min_confirmations: c });
      await reload();
    } catch (err) {
      note.textContent = err instanceof Error ? err.message : String(err);
      submit.disabled = false;
    }
  });
  const reason = h("input", { value: m?.decline_reason ?? "The financier declined this offer.", maxlength: "200", "aria-label": "Reason sent to the supplier" }) as HTMLInputElement;
  const decline = h("button", { class: "auth-link is-quiet", type: "button" }, "Decline") as HTMLButtonElement;
  decline.addEventListener("click", async () => {
    decline.disabled = true;
    try {
      await post(`/node/console/offers/${encodeURIComponent(relayId)}/decline`, { reason: reason.value });
      await reload();
    } catch (err) {
      note.textContent = err instanceof Error ? err.message : String(err);
      decline.disabled = false;
    }
  });
  const refuse = h("div", { class: "offer-decline" }, h("label", { class: "auth-field" }, h("span", {}, "Or decline, telling the supplier"), reason, h("small", {}, "Names only the kind of rule, never your numbers.")), decline);
  return h("div", { class: "offer" }, facts, checked, rules, form, refuse, note);
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
  "fund.withdraw": "Withdrawal request",
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

function mailbox(demo = false): HTMLElement {
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
    if (m.identity) {
      const id = m.identity;
      line.append(" · ", h("span", { class: id.registered ? "kyc-ok" : "kyc-flag" }, id.registered ? `KYC: ${id.label}` : id.missing ? "no identity key: not checked against KYC" : "identity key not in your KYC list"));
    }
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
    if (!demo) actions.append(remove);
    // HNK-30.T23: a member's withdrawal waits in the fund ledger for the end of the period
    if (m.type === "fund.withdraw" && !demo) {
      const queue = h("button", { type: "button" }, "Queue for the period's end") as HTMLButtonElement;
      queue.addEventListener("click", async () => {
        queue.disabled = true;
        try {
          const r = await post<{ units: number; period: number }>(`/node/console/fund/withdrawals/${encodeURIComponent(m.relay_id)}`);
          note.textContent = `Queued: ${r.units} units, paid when period ${r.period} closes.`;
          document.dispatchEvent(new Event("fund-changed"));
        } catch (e) {
          note.textContent = e instanceof Error ? e.message : String(e);
          queue.disabled = false;
        }
      });
      actions.prepend(queue);
    }
    return h(
      "li",
      { class: "mail-row" },
      h("span", { class: "mail-badge", "aria-hidden": "true" }, ROLE_BADGE[m.from?.role ?? ""] ?? "外"),
      h("span", { class: "mail-what" }, TYPE_LABEL[m.type] ?? m.type),
      signed ? h("span", { class: m.signature_ok ? "mail-verdict" : "mail-verdict is-bad", title: m.signature_ok ? "Signature holds" : "Signature does not hold" }, m.signature_ok ? "認" : "拒") : h("span", {}),
      line,
      m.offer ? offerBlock(m.relay_id, m.offer, demo, load) : null,
      actions,
    );
  };
  const refresh = h("button", { class: "auth-link", type: "button" }, "Refresh");
  refresh.addEventListener("click", load);
  void load();
  return h("section", { class: "mail is-tray", "aria-labelledby": "mail-title" }, h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "mail-title" }, "Mailbox"), refresh), list, note);
}

interface Buyer {
  identity_pk: string;
  label: string;
  added_at: number;
}

/** Buyers the financier knows from KYC (HNK-26.T7): their identity keys, kept on the node. */
function buyers(demo = false): HTMLElement {
  const list = h("ul", { class: "mail-list" });
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const load = async () => {
    try {
      const j = await get<{ buyers: Buyer[] }>("/node/console/buyers");
      list.replaceChildren(...j.buyers.map(row));
      if (!j.buyers.length) note.textContent = "No buyers yet. A buyer's identity key is in the buyer's app, under its invoice keys.";
    } catch (e) {
      note.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  const row = (b: Buyer): HTMLElement => {
    const actions = h("div", { class: "mail-actions" });
    if (!demo) {
      const remove = h("button", { type: "button" }, "Remove") as HTMLButtonElement;
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await del(`/node/console/buyers/${encodeURIComponent(b.identity_pk)}`);
          note.textContent = "Buyer removed.";
          await load();
        } catch (e) {
          note.textContent = e instanceof Error ? e.message : String(e);
          remove.disabled = false;
        }
      });
      actions.append(remove);
    }
    return h(
      "li",
      { class: "mail-row" },
      h("span", { class: "mail-badge", "aria-hidden": "true" }, "買"),
      h("span", { class: "mail-what" }, b.label),
      h("span", {}),
      h("span", { class: "mail-line" }, `added ${day(b.added_at)} · `, h("span", { class: "is-mono" }, short(b.identity_pk))),
      actions,
    );
  };
  const parts: HTMLElement[] = [h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "buyers-title" }, "Buyers (KYC)")), list];
  if (!demo) {
    const key = h("input", { maxlength: "64", placeholder: "64 hex characters", autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
    const label = h("input", { maxlength: "80", placeholder: "e.g. PT Sakura Niaga, KYC-0042", autocomplete: "off" }) as HTMLInputElement;
    const form = h(
      "form",
      { class: "offer-form" },
      h("label", { class: "auth-field" }, h("span", {}, "Identity key"), key, h("small", {}, "From the buyer, after your KYC.")),
      h("label", { class: "auth-field" }, h("span", {}, "Name or KYC reference"), label, h("small", {}, "Stays on your node.")),
      h("button", { class: "auth-link", type: "submit" }, "Add buyer"),
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await post("/node/console/buyers", { identity_pk: key.value.trim(), label: label.value });
        key.value = "";
        label.value = "";
        note.textContent = "Buyer added.";
        await load();
      } catch (err) {
        note.textContent = err instanceof Error ? err.message : String(err);
      }
    });
    parts.push(form);
  }
  parts.push(note);
  void load();
  return h("section", { class: "mail is-index", "aria-labelledby": "buyers-title" }, ...parts);
}

interface Device {
  id: string;
  paired_at: number;
  last_used: number | null;
  usable: boolean;
  current: boolean;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

function devices(demo = false): HTMLElement {
  const list = h("ul", { class: "mail-list" });
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const load = async () => {
    try {
      const j = await get<{ devices: Device[] }>("/node/console/devices");
      list.replaceChildren(...j.devices.map(row));
    } catch (e) {
      note.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  const row = (d: Device): HTMLElement => {
    const what = d.current ? "This device" : d.usable ? "Passkey" : "Old passkey";
    const line = d.usable
      ? `paired ${day(d.paired_at)}${d.last_used ? ` · last used ${day(d.last_used)}` : " · not used yet"}`
      : `paired ${day(d.paired_at)} on another address; it cannot sign in here`;
    const actions = h("div", { class: "mail-actions" });
    if (!d.current && !demo) {
      const remove = h("button", { type: "button" }, "Remove") as HTMLButtonElement;
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await del(`/node/console/devices/${encodeURIComponent(d.id)}`);
          note.textContent = "Passkey removed.";
          await load();
        } catch (e) {
          note.textContent = e instanceof Error ? e.message : String(e);
          remove.disabled = false;
        }
      });
      actions.append(remove);
    }
    return h(
      "li",
      { class: "mail-row" },
      h("span", { class: "mail-badge", "aria-hidden": "true" }, "鍵"),
      h("span", { class: "mail-what" }, what),
      h("span", {}),
      h("span", { class: "mail-line" }, line, " · ", h("span", { class: "is-mono" }, `${d.id.slice(0, 8)}…`)),
      actions,
    );
  };

  const link = h("p", { class: "invite-link is-mono" });
  const copy = h("button", { class: "auth-link", type: "button" }, "Copy link");
  const invite = h("div", { class: "invite", hidden: true }, h("p", { class: "mail-note" }, "Open this link on the new device within 15 minutes. It works once."), link, copy);
  const add = h("button", { class: "auth-link", type: "button" }, "Add a device");
  add.addEventListener("click", async () => {
    try {
      const r = await post<{ link: string }>("/node/console/devices/code");
      link.textContent = r.link;
      invite.hidden = false;
    } catch (e) {
      note.textContent = e instanceof Error ? e.message : String(e);
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
  void load();
  return h("section", { class: "mail is-keys", "aria-labelledby": "devices-title" }, h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "devices-title" }, "Devices"), demo ? null : add), list, invite, note);
}

function loginView(session: Session, rerender: () => void): HTMLElement {
  const name = keptName();
  const msg = new Message();
  const foot = h("div", { class: "auth-foot" }, h("p", { class: "auth-protected" }, lockIcon(), "Protected by your device passkey"), h("p", { class: "auth-host" }, `Works only on ${location.host}`));
  if (!session.console) {
    msg.show("The console is off on this node. Ask your node provider.");
    return h("main", { class: "auth" }, authSheet(head("Financier console", null), msg.el, foot));
  }
  if (session.demo) return demoLogin(rerender, foot);
  if (!session.paired) {
    return h("main", { class: "auth" }, authSheet(head("Financier console", "No passkey is set up for this console yet. Open the invite link your node provider sent you."), foot));
  }
  const go = row(passkeyIcon(), "Continue with passkey", "Fingerprint, face or device PIN", chevron(), async () => {
    msg.clear();
    try {
      await assert("/node/console/login/start", "/node/console/login/finish");
      rerender();
    } catch (e) {
      msg.error(e);
    }
  });
  return h(
    "main",
    { class: "auth" },
    authSheet(
      head(name ? `Welcome back, ${name}` : "Log in to your console", "Use the passkey you set up for this console."),
      h("div", { class: "auth-list" }, go),
      msg.el,
      h("p", { class: "auth-switch" }, "New device? ", link("Open an invite link", () => (location.href = "/console/pair"))),
      foot,
    ),
  );
}

/** The demo console's door: a visitor creates a passkey (no invite) or comes back with one. */
function demoLogin(rerender: () => void, foot: HTMLElement): HTMLElement {
  const msg = new Message();
  const create = row(h("span", { class: "auth-badge", "aria-hidden": "true" }, "証"), "Create a passkey to try it", "No invite and no account: a passkey for this demo only", chevron(), async () => {
    msg.clear();
    try {
      const start = await post<{ ceremony: string; options: { publicKey: Record<string, unknown> } }>("/node/console/pair/start", { code: "" });
      const cred = (await navigator.credentials.create({ publicKey: creationOptions(start.options.publicKey) })) as PublicKeyCredential;
      await post("/node/console/pair/finish", { ceremony: start.ceremony, credential: registrationJson(cred) });
      rerender();
    } catch (e) {
      msg.error(e instanceof DOMException && e.name === "NotAllowedError" ? new Error("The passkey was not created.") : e);
    }
  });
  const back = row(passkeyIcon(), "I tried it before", "Continue with the passkey you made here", chevron(), async () => {
    msg.clear();
    try {
      await assert("/node/console/login/start", "/node/console/login/finish");
      rerender();
    } catch (e) {
      msg.error(e);
    }
  });
  return h(
    "main",
    { class: "auth" },
    authSheet(
      head("Try the financier console", "A demo node on Zcash testnet. Sign in as its financier: read its sealed mailbox and see how payments wait for your passkey. Nothing here moves money."),
      h("div", { class: "auth-list" }, create, back),
      msg.el,
      foot,
    ),
  );
}

/** The financier's own display name: shown only here and at log in on this browser. */
function nameSection(current: string | null | undefined, onSaved: (name: string) => void): HTMLElement {
  const input = h("input", { maxlength: "60", placeholder: "e.g. Kurogane Capital", autocomplete: "organization" }) as HTMLInputElement;
  input.value = current ?? "";
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const form = h(
    "form",
    { class: "name-form" },
    h("label", { class: "auth-field" }, h("span", {}, "Your name"), input, h("small", {}, "Shown only in your own console.")),
    h("button", { class: "auth-link", type: "submit" }, "Save"),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await post<{ name: string }>("/node/console/name", { name: input.value });
      keepName(r.name);
      note.textContent = "Saved.";
      onSaved(r.name);
    } catch (err) {
      note.textContent = err instanceof Error ? err.message : String(err);
    }
  });
  return h("section", { class: "mail is-name", "aria-labelledby": "name-title" }, h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "name-title" }, "Profile")), form, note);
}

interface MandateData {
  min_zat: number;
  max_zat: number;
  max_tenor_days: number;
  buyer_kyc: boolean;
}

/** The public mandate (HNK-30.T19, D-47): what suppliers see of this financier in the directory.
 *  The node signs it and sends it to the node provider, who lists it; the detailed rules for
 *  offers stay private on the node (N-15). */
function mandate(demo = false): HTMLElement {
  const input = (attrs: Record<string, string>) => h("input", { inputmode: "decimal", ...attrs }) as HTMLInputElement;
  const min = input({ placeholder: "0.0001" });
  const max = input({ placeholder: "1" });
  const tenor = input({ inputmode: "numeric", placeholder: "90" });
  const kyc = h("input", { type: "checkbox" }) as HTMLInputElement;
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const zat = (v: string) => Math.round(Number(v) * 1e8);
  void get<{ mandate: MandateData | null }>("/node/console/mandate").then(
    (r) => {
      if (!r.mandate) return;
      min.value = zec(r.mandate.min_zat);
      max.value = zec(r.mandate.max_zat);
      tenor.value = String(r.mandate.max_tenor_days);
      kyc.checked = r.mandate.buyer_kyc;
      note.textContent = "This is what the directory shows now, once the provider listed it.";
    },
    () => undefined,
  );
  const send = h("button", { class: "auth-link", type: "submit" }, "Send to the directory") as HTMLButtonElement;
  const form = h(
    "form",
    { class: "offer-form mandate-form" },
    h("label", { class: "auth-field" }, h("span", {}, "Smallest invoice (ZEC)"), min),
    h("label", { class: "auth-field" }, h("span", {}, "Largest invoice (ZEC)"), max),
    h("label", { class: "auth-field" }, h("span", {}, "Longest tenor (days)"), tenor),
    h("label", { class: "mandate-kyc" }, kyc, h("span", {}, "Only buyers I know from KYC")),
    demo ? h("span", {}) : send,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    send.disabled = true;
    try {
      const body: MandateData = { min_zat: zat(min.value), max_zat: zat(max.value), max_tenor_days: Math.round(Number(tenor.value)), buyer_kyc: kyc.checked };
      if (![body.min_zat, body.max_zat, body.max_tenor_days].every(Number.isFinite)) throw new Error("fill in the three numbers");
      await post("/node/console/mandate", body);
      note.textContent = "Signed and sent to the node provider. Suppliers see it once the provider lists it.";
    } catch (err) {
      note.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      send.disabled = false;
    }
  });
  // HNK-30.T21 (D-48): the provider attests this financier's record from the board; only coarse
  // classes appear in the directory.
  const attest = h("button", { class: "auth-link", type: "button" }, "Ask the provider to attest my record") as HTMLButtonElement;
  attest.addEventListener("click", async () => {
    attest.disabled = true;
    try {
      const r = await post<{ deals: number }>("/node/console/reputation");
      note.textContent = `Sent ${r.deals} deal fingerprint(s) with their salts, sealed to the node provider. It checks them on the board and lists only classes (deals settled, share on time).`;
    } catch (err) {
      note.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      attest.disabled = false;
    }
  });
  return h(
    "section",
    { class: "mail is-mandate", "aria-labelledby": "mandate-title" },
    h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "mandate-title" }, "Public mandate")),
    h("p", { class: "mail-note mandate-lede" }, "What suppliers see of you in the financier directory. Your detailed rules for offers stay on this node."),
    form,
    demo ? null : attest,
    note,
  );
}

interface DealRow {
  n: string;
  invoice_id: string;
  amount_zat: number;
  advance_zat: number;
  due_date: number;
  state: string;
  entry_txid?: string;
  advance_txid?: string;
  stopped?: string;
  letter_sent: boolean;
  repayment?: string | null;
  paid_zat?: number | null;
  settled_txid?: string | null;
  bundle_sent?: boolean;
  problem: string | null;
  intent?: { n: string; amount_zat: number; address: string };
}

// The deal's route on B's desk (HNK-26.T16, SEQ-03): one station per state of the node's flow.
const ROUTE: Array<{ glyph: string; label: string; states: string[] }> = [
  { glyph: "照", label: "Board checked", states: ["Check"] },
  { glyph: "署", label: "Supplier signed the entry", states: ["AwaitSupplierSignature"] },
  { glyph: "登", label: "Entry on the board", states: ["Register", "AwaitConfirmation"] },
  { glyph: "印", label: "Letter sealed by supplier and buyer", states: ["AwaitAssignment"] },
  { glyph: "金", label: "Advance paid", states: ["Pay", "AwaitAdvanceConfirmation"] },
  { glyph: "済", label: "Done", states: ["Done"] },
];

const WAITING: Record<string, string> = {
  Check: "Checking the board for this invoice.",
  AwaitSupplierSignature: "Waiting for the supplier to sign the board entry.",
  Register: "Posting the entry to the board.",
  AwaitConfirmation: "Entry posted; waiting for its confirmations.",
  AwaitAssignment: "Letter sent; waiting for the supplier's and the buyer's seals.",
  Pay: "Sealed by both. Your passkey approves the advance.",
  AwaitAdvanceConfirmation: "Advance sent; waiting for it to be mined.",
  Done: "Advance paid and mined. The buyer pays you at maturity.",
};

/** The deals after Accept, moved by the node; the advance waits for the operator's passkey. */
function pipeline(demo = false): HTMLElement {
  const list = h("ol", { class: "pl-list" });
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const say = (e: unknown) => (note.textContent = e instanceof Error ? e.message : String(e));
  const row = (d: DealRow): HTMLElement => {
    const at = ROUTE.findIndex((r) => r.states.includes(d.state));
    const stations = h(
      "ol",
      { class: "pl-route", "aria-label": "Where this deal is" },
      ...ROUTE.map((r, i) =>
        h("li", { "data-at": d.state === "Stopped" ? "stopped" : i < at ? "done" : i === at ? "now" : "later", title: r.label }, h("b", { lang: "ja", "aria-hidden": "true" }, r.glyph), h("span", {}, r.label)),
      ),
    );
    const actions = h("div", { class: "mail-actions" });
    if (!demo && d.state === "Pay" && d.intent) {
      const intent = d.intent;
      const pay = h("button", { class: "auth-link", type: "button" }, `Approve with passkey: pay ${zec(d.advance_zat)} ZEC`) as HTMLButtonElement;
      pay.addEventListener("click", async () => {
        pay.disabled = true;
        try {
          const approval = await approvePayment(intent);
          await post(`/node/console/deals/${d.n}/pay`, { approval });
          await load();
        } catch (e) {
          say(e);
          pay.disabled = false;
        }
      });
      actions.append(pay);
    }
    if (!demo && !["Pay", "Done", "Stopped"].includes(d.state)) {
      const step = h("button", { type: "button" }, "Move on now") as HTMLButtonElement;
      step.addEventListener("click", async () => {
        step.disabled = true;
        try {
          await post(`/node/console/deals/${d.n}/step`);
          await load();
        } catch (e) {
          say(e);
          step.disabled = false;
        }
      });
      actions.append(step);
    }
    return h(
      "li",
      { class: "pl-deal" },
      h("p", { class: "pl-head" }, h("strong", {}, d.invoice_id), ` · ${zec(d.amount_zat)} ZEC due ${dueDay(d.due_date)} · advance ${zec(d.advance_zat)} ZEC`),
      stations,
      h("p", { class: "mail-note" }, d.state === "Stopped" ? `Stopped: ${d.stopped}` : (WAITING[d.state] ?? d.state)),
      d.state === "Done" && d.repayment
        ? h("p", { class: "mail-note" }, d.settled_txid ? `Repaid and settled on the board (${short(d.settled_txid)})${d.bundle_sent ? "; the bundle went to the supplier and the buyer" : ""}.` : `Repayment: ${d.repayment.toLowerCase()}${d.paid_zat ? `, ${zec(d.paid_zat)} ZEC received` : ""}.`)
        : null,
      d.problem ? h("p", { class: "offer-problem" }, d.problem) : null,
      d.advance_txid ? h("p", { class: "mail-note is-mono" }, `Advance ${short(d.advance_txid)}`) : d.entry_txid ? h("p", { class: "mail-note is-mono" }, `Entry ${short(d.entry_txid)}`) : null,
      actions,
    );
  };
  const load = async () => {
    try {
      const r = await get<{ deals: DealRow[] }>("/node/console/deals");
      list.replaceChildren(...(r.deals.length ? r.deals.map(row) : [h("li", { class: "pl-empty" }, "No deal yet: accept an offer from the mailbox.")]));
    } catch (e) {
      say(e);
    }
  };
  const refresh = h("button", { class: "auth-link", type: "button" }, "Refresh");
  refresh.addEventListener("click", load);
  void load();
  return h("section", { class: "mail is-deals", "aria-labelledby": "deals-title" }, h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "deals-title" }, "Deals"), refresh), list, note);
}

interface FundNav {
  assets_zat: number;
  units: number;
}

interface FundState {
  period: number;
  nav: FundNav;
  total_units: number;
  leaves: number;
  deposits: number;
  queue: Array<{ leaf: string; units: number; address: string; at: number }>;
  closes: Array<{ period: number; root: string; total_units: number; nav: FundNav; paid_zat: number; payout_txid: string | null; root_txid: string; held: boolean }>;
}

interface ClosePlan {
  plan_id: string;
  paid_zat: number;
  plan: { period: number; nav: FundNav; cash_zat: number; held: boolean; short: boolean; payouts: Array<{ leaf: string; units: number; amount_zat: number; address: string }> };
}

const price = (n: FundNav) => (n.assets_zat / Math.max(1, n.units)).toFixed(4);

/**
 * The fund ledger (HNK-30.T23, D-49), for a financier that runs a pooled fund: deposits seen in
 * the wallet become members' units, withdrawals wait for the period's end, and the close pays them
 * from cash with one passkey approval of the exact plan, then signs the new root into JTLR.
 */
function fundLedger(demo = false): HTMLElement {
  const book = h("dl", { class: "fd-book" });
  const queue = h("ol", { class: "fd-queue" });
  const planOut = h("div", { class: "fd-plan" });
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  const say = (e: unknown) => (note.textContent = e instanceof Error ? e.message : String(e));
  const load = async () => {
    try {
      const f = await get<FundState>("/node/console/fund");
      book.replaceChildren();
      fact(book, "Period", String(f.period));
      fact(book, "Price per unit", `${price(f.nav)} zat`);
      fact(book, "Units out", f.total_units.toLocaleString("en"));
      fact(book, "Holdings", `${f.leaves} from ${f.deposits} deposits`);
      const last = f.closes[0];
      if (last) fact(book, "Last close", `period ${last.period} · ${last.held ? "held, below par" : `${zec(last.paid_zat)} ZEC paid`}`, true, last.root);
      queue.replaceChildren(...(f.queue.length ? f.queue.map((r) => h("li", {}, h("b", {}, `${r.units.toLocaleString("en")} units`), h("span", { class: "is-mono" }, ` to ${short(r.address)}`))) : [h("li", { class: "is-empty" }, "No withdrawal waits for this period.")]));
    } catch (e) {
      say(e);
    }
  };
  document.addEventListener("fund-changed", () => void load());

  const member = h("input", { placeholder: "jitsuin-contact-v1:…", spellcheck: "false", autocomplete: "off" }) as HTMLInputElement;
  const txid = h("input", { placeholder: "transaction id", spellcheck: "false", autocomplete: "off" }) as HTMLInputElement;
  const record = h("button", { class: "auth-link", type: "submit" }, "Record the deposit") as HTMLButtonElement;
  const deposit = h(
    "form",
    { class: "offer-form fd-deposit" },
    h("label", { class: "auth-field" }, h("span", {}, "Member's contact card"), member),
    h("label", { class: "auth-field" }, h("span", {}, "Deposit transaction (mined, in this wallet)"), txid),
    record,
  );
  deposit.addEventListener("submit", async (e) => {
    e.preventDefault();
    record.disabled = true;
    try {
      const r = await post<{ amount_zat: number; units: number; receipt_sent: boolean }>("/node/console/fund/deposits", { member: member.value.trim(), txid: txid.value.trim() });
      say(`${zec(r.amount_zat)} ZEC bought ${r.units.toLocaleString("en")} units. ${r.receipt_sent ? "The receipt, with its withdraw token, is sealed to the member." : "The units are recorded, but the receipt did not reach the relay: the member cannot withdraw them until they have it."}`);
      member.value = txid.value = "";
      await load();
    } catch (err) {
      say(err);
    } finally {
      record.disabled = false;
    }
  });

  const planBtn = h("button", { class: "auth-link", type: "button" }, "Plan the period's close") as HTMLButtonElement;
  planBtn.addEventListener("click", async () => {
    planBtn.disabled = true;
    planOut.replaceChildren();
    try {
      say("Syncing the wallet and valuing the fund…");
      const p = await post<ClosePlan>("/node/console/fund/plan");
      const pl = p.plan;
      const lines = pl.payouts.map((x) => h("li", {}, h("b", {}, `${zec(x.amount_zat)} ZEC`), ` for ${x.units.toLocaleString("en")} units · `, h("span", { class: "is-mono" }, short(x.address))));
      const pay = h("button", { class: "auth-link fd-pay", type: "button" }, pl.payouts.length ? `Approve with passkey: pay ${zec(p.paid_zat)} ZEC and sign the root` : "Approve with passkey: sign the root") as HTMLButtonElement;
      pay.addEventListener("click", async () => {
        pay.disabled = true;
        try {
          const approval = await approvePlan(p.plan_id);
          const r = await post<{ period: number; paid_zat: number; root: string; root_txid: string | null; root_error: string | null; undelivered: number }>("/node/console/fund/close", { plan_id: p.plan_id, approval });
          say(`Period ${r.period} closed: ${zec(r.paid_zat)} ZEC paid, root ${short(r.root)} ${r.root_txid ? "signed on chain" : `not posted yet (${r.root_error})`}. ${r.undelivered ? `${r.undelivered} message(s) did not reach the relay.` : "Every member has their path."}`);
          planOut.replaceChildren();
          await load();
        } catch (err) {
          say(err);
          pay.disabled = false;
        }
      });
      planOut.replaceChildren(
        h("p", { class: "mail-note" }, `Period ${pl.period} at ${price(pl.nav)} zat per unit, ${zec(pl.cash_zat)} ZEC in cash. ${pl.held ? "Below par: no withdrawal is paid this period." : pl.short ? "Cash does not cover the queue: every request gets the same share, the rest waits." : ""}`),
        lines.length ? h("ol", { class: "fd-queue" }, ...lines) : h("p", { class: "mail-note" }, "Nothing to pay; the close signs the new root."),
        demo ? h("span", {}) : pay,
      );
      note.textContent = "";
    } catch (err) {
      say(err);
    } finally {
      planBtn.disabled = false;
    }
  });

  void load();
  return h(
    "section",
    { class: "mail is-fund", "aria-labelledby": "fund-title" },
    h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "fund-title" }, "Fund ledger")),
    h("p", { class: "mail-note" }, "For a pooled fund: members hold units, priced from this wallet's cash and receivables at each close."),
    book,
    queue,
    demo ? null : deposit,
    demo ? null : planBtn,
    planOut,
    note,
  );
}

interface PrivateRules {
  max_face_zat?: number;
  max_tenor_days?: number;
  min_discount_bps?: number;
  min_buyer_history?: number;
  buyer_kyc: boolean;
}

/** The private mandate 内規 (HNK-30.T11, N-15): rules that stay on this node, matched to offers. */
function privateMandate(demo = false): HTMLElement {
  const num = (attrs: Record<string, string>) => h("input", { inputmode: "decimal", ...attrs }) as HTMLInputElement;
  const face = num({ placeholder: "no limit" });
  const tenor = num({ inputmode: "numeric", placeholder: "no limit" });
  const discount = num({ placeholder: "none" });
  const history = num({ inputmode: "numeric", placeholder: "none" });
  const kyc = h("input", { type: "checkbox" }) as HTMLInputElement;
  const note = h("p", { class: "mail-note", role: "status", "aria-live": "polite" });
  void get<{ mandate: PrivateRules }>("/node/console/mandate/private").then(
    ({ mandate: m }) => {
      if (m.max_face_zat) face.value = zec(m.max_face_zat);
      if (m.max_tenor_days) tenor.value = String(m.max_tenor_days);
      if (m.min_discount_bps) discount.value = String(m.min_discount_bps / 100);
      if (m.min_buyer_history) history.value = String(m.min_buyer_history);
      kyc.checked = m.buyer_kyc;
    },
    () => undefined,
  );
  const opt = (v: string, f: (n: number) => number) => {
    if (!v.trim()) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error("rules are positive numbers, or empty for none");
    return f(n);
  };
  const save = h("button", { class: "auth-link", type: "submit" }, "Keep these rules on the node") as HTMLButtonElement;
  const form = h(
    "form",
    { class: "offer-form mandate-form" },
    h("label", { class: "auth-field" }, h("span", {}, "Largest invoice (ZEC)"), face),
    h("label", { class: "auth-field" }, h("span", {}, "Longest tenor (days)"), tenor),
    h("label", { class: "auth-field" }, h("span", {}, "Smallest discount (%)"), discount),
    h("label", { class: "auth-field" }, h("span", {}, "Buyer history (invoices)"), history),
    h("label", { class: "mandate-kyc" }, kyc, h("span", {}, "Buyer's identity must be in my KYC list")),
    demo ? h("span", {}) : save,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      const body: PrivateRules = {
        max_face_zat: opt(face.value, (n) => Math.round(n * 1e8)),
        max_tenor_days: opt(tenor.value, Math.round),
        min_discount_bps: opt(discount.value, (n) => Math.round(n * 100)),
        min_buyer_history: opt(history.value, Math.round),
        buyer_kyc: kyc.checked,
      };
      await post("/node/console/mandate/private", body);
      note.textContent = "Kept on this node only. Every offer in the mailbox is now matched against these rules.";
    } catch (err) {
      note.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      save.disabled = false;
    }
  });
  return h(
    "section",
    { class: "mail is-rules", "aria-labelledby": "rules-title" },
    h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "rules-title" }, "Private mandate")),
    h("p", { class: "mail-note mandate-lede" }, "Your own rules for offers. They never leave this node: suppliers only learn which kind of rule an offer broke."),
    form,
    note,
  );
}

/** What a supplier needs to offer this node an invoice: the contact card and the financier key. */
function share(info: Info): HTMLElement {
  const item = (label: string, value: string, hint: string): HTMLElement => {
    const text = h("p", { class: "invite-link is-mono" }, value);
    const copy = h("button", { class: "auth-link", type: "button" }, "Copy");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value);
        copy.textContent = "Copied";
      } catch {
        getSelection()?.selectAllChildren(text);
      }
    });
    return h("div", { class: "invite" }, h("p", { class: "mail-note offer-checked" }, h("strong", {}, label), ` ${hint}`), text, copy);
  };
  return h(
    "section",
    { class: "mail is-meishi", "aria-labelledby": "share-title" },
    h("div", { class: "mail-head" }, h("h2", { class: "mail-title", id: "share-title" }, "For suppliers")),
    item("Contact card.", info.contact, "Suppliers send their offers sealed to this mailbox."),
    item("Financier key.", info.financier_pk, "The supplier's app checks it against the card's fingerprint."),
  );
}

export async function homeView(rerender: () => void): Promise<HTMLElement> {
  const [session, info] = await Promise.all([get<Session>("/node/console/session"), get<Info>("/node/info")]);
  if (!session.signed_in) return loginView(session, rerender);
  keepName(session.name);
  const demo = session.demo === true;

  // Signed in (HNK-30.T16, MASTER.md §8): the financier sits on B's side of the 登記所 counter,
  // in the registry room. The mailbox is the in-tray of letters, the contact card a meishi, the
  // KYC registry an index box, the paired passkeys keys on a rack.
  const title = h("h1", { class: "dk-title" }, session.name ? `Welcome, ${session.name}` : "Financier console");
  const facts = h("dl", { class: "dk-facts" });
  fact(facts, "Network", info.network === "main" ? "Zcash mainnet" : "Zcash testnet");
  fact(facts, "Node key", contactFingerprint(info.contact), true);
  fact(facts, "Mailbox", short(info.mailbox_id), true, info.mailbox_id);
  fact(facts, "Wallet", short(info.wallet_address), true, info.wallet_address);
  const out = h("button", { class: "auth-link", type: "button" }, "Sign out");
  out.addEventListener("click", async () => {
    await post("/node/console/logout").catch(() => undefined);
    rerender();
  });
  const plaque = h(
    "header",
    { class: "dk-plaque" },
    seal(),
    h(
      "div",
      { class: "dk-who" },
      h("p", { class: "dk-eyebrow" }, h("span", { lang: "ja" }, "登記所"), demo ? "Demo console: payments, invites, removals and the profile are off" : "Financier node · the keys and wallet stay on the node"),
      title,
      facts,
    ),
    out,
  );
  return h(
    "main",
    { class: "auth dk" },
    h("span", { class: "dk-lamp", "aria-hidden": "true" }),
    plaque,
    h(
      "div",
      { class: "dk-desk" },
      h("div", { class: "dk-left" }, mailbox(demo), pipeline(demo), fundLedger(demo)),
      h("div", { class: "dk-right" }, share(info), mandate(demo), privateMandate(demo), buyers(demo), devices(demo), demo ? null : nameSection(session.name, (n) => (title.textContent = `Welcome, ${n}`))),
    ),
  );
}
