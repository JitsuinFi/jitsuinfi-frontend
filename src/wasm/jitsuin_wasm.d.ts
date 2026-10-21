/* tslint:disable */
/* eslint-disable */

/**
 * Fields of an assignment letter; pass the invoice (or "") to check that the letter is for it.
 */
export function assignmentDecode(assignment_b64: string, invoice_b64: string): string;

export function assignmentEncode(invoice_b64: string, financier_pk_hex: string, financier_address: string, terms_hash_hex: string): string;

export function assignmentStatus(invoice_b64: string, assignment_b64: string, seals_json: string): string;

export function boardMemoDescribe(memo_b64: string): string;

export function bundleBuild(json: string): string;

export function bundleOnBoard(bundle_b64: string, board_json: string): string;

export function buyerHistoryCert(master_hex: string, index: number, invoice_b64: string, financier_pk_hex: string, prev_b64: string): string;

export function buyerHistoryCertBytes(master: Uint8Array, index: number, invoice_b64: string, financier_pk_hex: string, prev_b64: string): string;

export function buyerKeys(master_hex: string, index: number): string;

export function buyerKeysBytes(master: Uint8Array, index: number): string;

export function buyerRepayment(master_hex: string, index: number, invoice_b64: string, assignment_b64: string, date: number): string;

export function buyerRepaymentBytes(master: Uint8Array, index: number, invoice_b64: string, assignment_b64: string, date: number): string;

export function buyerSealAssignment(master_hex: string, index: number, invoice_b64: string, assignment_b64: string, supplier_seal_b64: string): string;

export function buyerSealAssignmentBytes(master: Uint8Array, index: number, invoice_b64: string, assignment_b64: string, supplier_seal_b64: string): string;

export function buyerSignInvoice(master_hex: string, index: number, invoice_b64: string): string;

export function buyerSignInvoiceBytes(master: Uint8Array, index: number, invoice_b64: string): string;

export function documentHash(file: Uint8Array): string;

/**
 * `first_at` and `second_at`: board positions as JSON `{txid, height, tx_index, output_index}`
 * (omit for an entry that is not on chain; `jitsuin verify` needs the first one).
 */
export function doubleSignProof(invoice_b64: string, buyer_signature_hex: string, first_memo_b64: string, second_memo_b64: string, first_at?: string | null, second_at?: string | null): string;

export function exhibitFromProof(proof_b64: string): string;

export function financierCommitment(financier_secret_hex: string, invoice_b64: string): string;

export function financierSealAssignment(financier_secret_hex: string, invoice_b64: string, assignment_b64: string, seals_json: string): string;

export function financierSettle(financier_secret_hex: string, invoice_b64: string, assignment_b64: string, repayment_memo_b64: string): string;

export function historyNext(certs_json: string, identity_pk_hex: string, board_json: string): string;

export function invoiceDecode(invoice_b64: string): string;

export function invoiceEncode(json: string): string;

export function invoiceNullifier(invoice_b64: string): string;

/**
 * `mailbox_id` of a recipient's `mailbox_pk`.
 */
export function mailboxId(mailbox_pk_hex: string): string;

/**
 * Mailbox key and id (HNK-23.T2) from the passkey's second PRF output, which is wiped.
 */
export function mailboxKeysBytes(prf_second: Uint8Array): string;

/**
 * Opens a sealed message for this mailbox; the PRF output is wiped.
 */
export function mailboxOpenBytes(prf_second: Uint8Array, sealed: Uint8Array): Uint8Array;

/**
 * Answer to a relay challenge; the PRF output is wiped.
 */
export function mailboxProofBytes(prf_second: Uint8Array, purpose: string, eph_pk_hex: string, nonce_hex: string): string;

/**
 * Seals a message to a recipient's `mailbox_pk`. `eph_secret` is 32 fresh random bytes
 * (`crypto.getRandomValues`), used once and wiped.
 */
export function mailboxSeal(recipient_pk_hex: string, eph_secret: Uint8Array, message: Uint8Array): Uint8Array;

/**
 * Signs a relay message header's signing bytes with a party key (wiped); refuses any other bytes.
 */
export function messageSignBytes(secret: Uint8Array, signing_bytes: Uint8Array): string;

/**
 * A ZIP-321 payment request without memo and its QR, as JSON `{uri, qr_svg}`.
 */
export function paymentRequest(address: string, amount_zat: bigint): string;

export function publicKey(secret_hex: string): string;

/**
 * A QR code (SVG) of a short text, such as a contact card.
 */
export function qrSvg(text: string): string;

export function rateIndex(board_json: string, k: number): string;

/**
 * 64 bytes: AES-256-GCM key, then HMAC-SHA-256 index key, for the encrypted local deal store.
 */
export function storageKeysBytes(master: Uint8Array): Uint8Array;

/**
 * Public key (hex) of the supplier's per-invoice key for `invoice_id` and the buyer's
 * `invoice_pk(k)`.
 */
export function supplierInvoicePublicKeyBytes(master: Uint8Array, invoice_id: string, buyer_pk_hex: string): string;

/**
 * The per-invoice secret as 32 bytes, to hand to a supplier `*Bytes` function (which wipes it).
 */
export function supplierInvoiceSecretBytes(master: Uint8Array, invoice_id: string, buyer_pk_hex: string): Uint8Array;

/**
 * `discount` and `tenor` are the classes from the financier (both or neither; omitted = `0/0`).
 */
export function supplierRegisterEntry(supplier_secret_hex: string, invoice_b64: string, financier_pk_hex: string, salt_hex: string, discount?: number | null, tenor?: number | null): string;

export function supplierRegisterEntryBytes(supplier_secret: Uint8Array, invoice_b64: string, financier_pk_hex: string, salt_hex: string, discount?: number | null, tenor?: number | null): string;

export function supplierRegisterHistoryEntry(supplier_secret_hex: string, invoice_b64: string, financier_pk_hex: string, salt_hex: string, cert_b64: string, discount?: number | null, tenor?: number | null): string;

export function supplierRegisterHistoryEntryBytes(supplier_secret: Uint8Array, invoice_b64: string, financier_pk_hex: string, salt_hex: string, cert_b64: string, discount?: number | null, tenor?: number | null): string;

/**
 * Register memo carrying a history tag (hex) from the financier, without certificate k.
 */
export function supplierRegisterTaggedEntry(supplier_secret_hex: string, invoice_b64: string, financier_pk_hex: string, salt_hex: string, history_tag_hex: string, discount?: number | null, tenor?: number | null): string;

export function supplierRegisterTaggedEntryBytes(supplier_secret: Uint8Array, invoice_b64: string, financier_pk_hex: string, salt_hex: string, history_tag_hex: string, discount?: number | null, tenor?: number | null): string;

export function supplierSealAssignment(supplier_secret_hex: string, invoice_b64: string, assignment_b64: string): string;

export function supplierSealAssignmentBytes(supplier_secret: Uint8Array, invoice_b64: string, assignment_b64: string): string;

export function verifyBundle(bundle_b64: string): string;

export function verifyExhibitOnBoard(exhibit_b64: string, board_json?: string | null, invoice_b64?: string | null): string;

export function verifyHistory(certs_json: string, identity_pk_hex: string, allowlist_json: string, board_json: string, today: number, grace_days: number): string;

export function verifyProof(proof_b64: string): string;

export function verifyProofOnBoard(proof_b64: string, board_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly assignmentDecode: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly assignmentEncode: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly assignmentStatus: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly boardMemoDescribe: (a: number, b: number) => [number, number, number, number];
    readonly bundleBuild: (a: number, b: number) => [number, number, number, number];
    readonly bundleOnBoard: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly buyerHistoryCert: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly buyerHistoryCertBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly buyerKeys: (a: number, b: number, c: number) => [number, number, number, number];
    readonly buyerKeysBytes: (a: number, b: number, c: any, d: number) => [number, number, number, number];
    readonly buyerRepayment: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly buyerRepaymentBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly buyerSealAssignment: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly buyerSealAssignmentBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly buyerSignInvoice: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly buyerSignInvoiceBytes: (a: number, b: number, c: any, d: number, e: number, f: number) => [number, number, number, number];
    readonly documentHash: (a: number, b: number) => [number, number];
    readonly doubleSignProof: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly exhibitFromProof: (a: number, b: number) => [number, number, number, number];
    readonly financierCommitment: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly financierSealAssignment: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly financierSettle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly historyNext: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly invoiceDecode: (a: number, b: number) => [number, number, number, number];
    readonly invoiceEncode: (a: number, b: number) => [number, number, number, number];
    readonly invoiceNullifier: (a: number, b: number) => [number, number, number, number];
    readonly mailboxId: (a: number, b: number) => [number, number, number, number];
    readonly mailboxKeysBytes: (a: number, b: number, c: any) => [number, number, number, number];
    readonly mailboxOpenBytes: (a: number, b: number, c: any, d: number, e: number) => [number, number, number, number];
    readonly mailboxProofBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly mailboxSeal: (a: number, b: number, c: number, d: number, e: any, f: number, g: number) => [number, number, number, number];
    readonly messageSignBytes: (a: number, b: number, c: any, d: number, e: number) => [number, number, number, number];
    readonly paymentRequest: (a: number, b: number, c: bigint) => [number, number, number, number];
    readonly publicKey: (a: number, b: number) => [number, number, number, number];
    readonly qrSvg: (a: number, b: number) => [number, number, number, number];
    readonly rateIndex: (a: number, b: number, c: number) => [number, number, number, number];
    readonly storageKeysBytes: (a: number, b: number, c: any) => [number, number, number, number];
    readonly supplierInvoicePublicKeyBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly supplierInvoiceSecretBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly supplierRegisterEntry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly supplierRegisterEntryBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number, number];
    readonly supplierRegisterHistoryEntry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly supplierRegisterHistoryEntryBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number, number, number];
    readonly supplierRegisterTaggedEntry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly supplierRegisterTaggedEntryBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number, number, number];
    readonly supplierSealAssignment: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly supplierSealAssignmentBytes: (a: number, b: number, c: any, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly verifyBundle: (a: number, b: number) => [number, number, number, number];
    readonly verifyExhibitOnBoard: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly verifyHistory: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly verifyProof: (a: number, b: number) => [number, number, number, number];
    readonly verifyProofOnBoard: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
