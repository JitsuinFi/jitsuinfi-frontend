// What the node sends the console (/node/info, /node/console/*, /node/mail): HNK-26, HNK-30.

export interface Session {
  signed_in: boolean;
  paired: boolean;
  console: boolean;
  name?: string | null;
  /** The judges' demo console (HNK-26.T26): no invite, nothing that moves money. */
  demo?: boolean;
}

export interface Info {
  network: string;
  financier_pk: string;
  mailbox_id: string;
  wallet_address: string;
  contact: string;
}

export interface Mail {
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

export interface Offer {
  ok: boolean;
  problem?: string;
  n?: string;
  invoice_id?: string;
  amount_zat?: number;
  due_date?: number;
  advance_zat?: number;
  supplier_address?: string;
  accepted?: { advance_zat: number; min_confirmations: number; accepted_at: number } | null;
  /** E2E audit 2026-10-25: where the commitment opening is, once accepted. */
  opening?: "sent" | "awaiting_history" | "sent_after_history";
  /** HNK-26.T6: when the node declines it unanswered (seconds since the epoch). */
  expires_at?: number;
  /** HNK-30.T11: the offer against the private mandate, checked on the node. */
  mandate?: { verdict: "fits" | "breaks" | "waiting" | "none"; rules: Array<{ rule: string; ok: boolean | null; detail: string }>; decline_reason: string };
}

export interface Buyer {
  identity_pk: string;
  label: string;
  added_at: number;
}

export interface Device {
  id: string;
  paired_at: number;
  last_used: number | null;
  usable: boolean;
  current: boolean;
}

export interface MandateData {
  min_zat: number;
  max_zat: number;
  max_tenor_days: number;
  buyer_kyc: boolean;
}

export interface DealRow {
  n: string;
  invoice_id: string;
  amount_zat: number;
  advance_zat: number;
  due_date: number;
  state: string;
  entry_txid?: string;
  advance_txid?: string;
  stopped?: string;
  stopped_winner?: string;
  /** E2E audit 2026-10-25: whose entry came first on the board. */
  stopped_order?: "ours_first" | "theirs_first" | "others_only";
  // HNK-32.T4 (BL-D23-14): the entry's confirmations at the last board check, and the minimum
  confirmations?: number | null;
  min_confirmations?: number;
  letter_sent: boolean;
  repayment?: string | null;
  paid_zat?: number | null;
  settled_txid?: string | null;
  evidence?: string | null;
  bundle?: string | null;
  bundle_sent?: boolean;
  history_requested?: boolean;
  history?: string | null;
  proof?: string | null;
  exhibit?: string | null;
  problem: string | null;
  intent?: { n: string; amount_zat: number; address: string };
}

export interface FundNav {
  assets_zat: number;
  units: number;
}

export interface FundState {
  period: number;
  nav: FundNav;
  total_units: number;
  leaves: number;
  deposits: number;
  queue: Array<{ leaf: string; units: number; address: string; at: number }>;
  closes: Array<{ period: number; root: string; total_units: number; nav: FundNav; paid_zat: number; payout_txid: string | null; root_txid: string; held: boolean; books?: boolean }>;
  /** The first period valued on the fund's books (2026-10-25); null for a ledger from before. */
  books_since?: number | null;
}

export interface ClosePlan {
  plan_id: string;
  paid_zat: number;
  /** `cash_zat`: the fund's cash on its books; `wallet_zat`: the node's whole wallet (2026-10-25). */
  plan: { period: number; nav: FundNav; cash_zat: number; wallet_zat?: number; held: boolean; short: boolean; payouts: Array<{ leaf: string; units: number; amount_zat: number; address: string }> };
}

export interface PrivateRules {
  max_face_zat?: number;
  max_tenor_days?: number;
  min_discount_bps?: number;
  min_buyer_history?: number;
  buyer_kyc: boolean;
  /** HNK-26.T9: the history policy. */
  min_on_time_pct?: number;
  grace_days?: number;
  trusted_financiers?: string[];
}

/** The node's board snapshot (/node/board, HNK-30.T4): only its scan height and time are read here. */
export interface BoardScan {
  tip: number;
  scanned_at: number;
}
