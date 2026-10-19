/* tslint:disable */
/* eslint-disable */

export function assignmentEncode(invoice_b64: string, financier_pk_hex: string, financier_address: string, terms_hash_hex: string): string;

export function assignmentStatus(invoice_b64: string, assignment_b64: string, seals_json: string): string;

export function boardMemoDescribe(memo_b64: string): string;

export function bundleBuild(json: string): string;

export function bundleOnBoard(bundle_b64: string, board_json: string): string;

export function buyerHistoryCert(master_hex: string, index: number, invoice_b64: string, financier_pk_hex: string, prev_b64: string): string;

export function buyerKeys(master_hex: string, index: number): string;

export function buyerRepayment(master_hex: string, index: number, invoice_b64: string, assignment_b64: string, date: number): string;

export function buyerSealAssignment(master_hex: string, index: number, invoice_b64: string, assignment_b64: string, supplier_seal_b64: string): string;

export function buyerSignInvoice(master_hex: string, index: number, invoice_b64: string): string;

export function documentHash(file: Uint8Array): string;

export function doubleSignProof(invoice_b64: string, buyer_signature_hex: string, first_memo_b64: string, second_memo_b64: string): string;

export function financierSealAssignment(financier_secret_hex: string, invoice_b64: string, assignment_b64: string, seals_json: string): string;

export function financierSettle(financier_secret_hex: string, invoice_b64: string, assignment_b64: string, repayment_memo_b64: string): string;

export function invoiceDecode(invoice_b64: string): string;

export function invoiceEncode(json: string): string;

export function invoiceNullifier(invoice_b64: string): string;

export function publicKey(secret_hex: string): string;

export function supplierRegisterEntry(supplier_secret_hex: string, invoice_b64: string, financier_pk_hex: string, salt_hex: string): string;

export function supplierRegisterHistoryEntry(supplier_secret_hex: string, invoice_b64: string, financier_pk_hex: string, salt_hex: string, cert_b64: string): string;

export function supplierSealAssignment(supplier_secret_hex: string, invoice_b64: string, assignment_b64: string): string;

export function verifyBundle(bundle_b64: string): string;

export function verifyHistory(certs_json: string, identity_pk_hex: string, allowlist_json: string, board_json: string, today: number, grace_days: number): string;

export function verifyProof(proof_b64: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly assignmentEncode: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly assignmentStatus: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly boardMemoDescribe: (a: number, b: number) => [number, number, number, number];
    readonly bundleBuild: (a: number, b: number) => [number, number, number, number];
    readonly bundleOnBoard: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly buyerHistoryCert: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly buyerKeys: (a: number, b: number, c: number) => [number, number, number, number];
    readonly buyerRepayment: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly buyerSealAssignment: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly buyerSignInvoice: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly documentHash: (a: number, b: number) => [number, number];
    readonly doubleSignProof: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly financierSealAssignment: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly financierSettle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly invoiceDecode: (a: number, b: number) => [number, number, number, number];
    readonly invoiceEncode: (a: number, b: number) => [number, number, number, number];
    readonly invoiceNullifier: (a: number, b: number) => [number, number, number, number];
    readonly publicKey: (a: number, b: number) => [number, number, number, number];
    readonly supplierRegisterEntry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly supplierRegisterHistoryEntry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly supplierSealAssignment: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly verifyBundle: (a: number, b: number) => [number, number, number, number];
    readonly verifyHistory: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly verifyProof: (a: number, b: number) => [number, number, number, number];
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
