// Encrypted deal store on the device (HNK-24.T3, C-07): supplier and buyer keep their deal
// documents (invoice, signatures, letter, seals, certificates) across sessions, because the relay
// only holds messages for a while.
//
// Keys come from the role's passkey master through jitsuin-wasm `storageKeysBytes(master)`
// (64 bytes: AES-256-GCM key, then HMAC-SHA-256 index key; HNK-24.T1). They are imported as
// non-extractable WebCrypto keys and the bytes are zeroed at once, so the page keeps no raw key.
// Each document is sealed with AES-GCM under a fresh 12-byte IV; the record name is an HMAC of
// the document id, so the database does not show which invoices (N) are stored. Uses only
// browser built-ins (WebCrypto, IndexedDB); falls back to memory when IndexedDB is blocked
// (private window, blocked site data), with `persistent = false` so the page can say so.
//
// Self-contained on purpose (no wasm import): tests run it under Node (`npm test`).

export type Role = "supplier" | "buyer";

/** One stored record: HMAC name, IV and AES-GCM ciphertext. */
export interface StoredRecord {
  name: string;
  iv: Uint8Array<ArrayBuffer>;
  ct: Uint8Array<ArrayBuffer>;
}

/** Where records live: IndexedDB in the browser, memory as fallback and in tests. */
export interface Backend {
  get(name: string): Promise<StoredRecord | undefined>;
  put(record: StoredRecord): Promise<void>;
  delete(name: string): Promise<void>;
  all(): Promise<StoredRecord[]>;
}

const VERSION = "jitsuinfi-store-v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

function toHex(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

export class MemoryBackend implements Backend {
  private records = new Map<string, StoredRecord>();
  async get(name: string): Promise<StoredRecord | undefined> {
    return this.records.get(name);
  }
  async put(record: StoredRecord): Promise<void> {
    this.records.set(record.name, record);
  }
  async delete(name: string): Promise<void> {
    this.records.delete(name);
  }
  async all(): Promise<StoredRecord[]> {
    return [...this.records.values()];
  }
}

const DB_NAME = "jitsuinfi-deals";
const OBJECT_STORE = "records";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IndexedDbBackend implements Backend {
  private readonly db: IDBDatabase;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(): Promise<IndexedDbBackend> {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(OBJECT_STORE)) {
        r.result.createObjectStore(OBJECT_STORE, { keyPath: "name" });
      }
    };
    return new IndexedDbBackend(await request(r));
  }

  private store(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(OBJECT_STORE, mode).objectStore(OBJECT_STORE);
  }
  async get(name: string): Promise<StoredRecord | undefined> {
    return (await request(this.store("readonly").get(name))) as StoredRecord | undefined;
  }
  async put(record: StoredRecord): Promise<void> {
    await request(this.store("readwrite").put(record));
  }
  async delete(name: string): Promise<void> {
    await request(this.store("readwrite").delete(name));
  }
  async all(): Promise<StoredRecord[]> {
    return (await request(this.store("readonly").getAll())) as StoredRecord[];
  }
}

export class DealStore {
  private readonly role: Role;
  private readonly encKey: CryptoKey;
  private readonly idxKey: CryptoKey;
  private readonly backend: Backend;
  /** False when the documents only live in memory (IndexedDB unavailable). */
  readonly persistent: boolean;

  private constructor(role: Role, encKey: CryptoKey, idxKey: CryptoKey, backend: Backend, persistent: boolean) {
    this.role = role;
    this.encKey = encKey;
    this.idxKey = idxKey;
    this.backend = backend;
    this.persistent = persistent;
  }

  /**
   * Opens the store of `role` with the 64 key bytes from `storageKeysBytes(master)`.
   * `keyMaterial` is zeroed before this returns, whether it succeeds or not.
   */
  static async open(role: Role, keyMaterial: Uint8Array, backend?: Backend): Promise<DealStore> {
    try {
      if (keyMaterial.length !== 64) throw new Error("expected 64 bytes of storage keys");
      const subtle = globalThis.crypto.subtle;
      const encKey = await subtle.importKey("raw", keyMaterial.slice(0, 32), "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
      const idxKey = await subtle.importKey(
        "raw",
        keyMaterial.slice(32, 64),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      if (backend) return new DealStore(role, encKey, idxKey, backend, !(backend instanceof MemoryBackend));
      try {
        return new DealStore(role, encKey, idxKey, await IndexedDbBackend.open(), true);
      } catch {
        return new DealStore(role, encKey, idxKey, new MemoryBackend(), false);
      }
    } finally {
      keyMaterial.fill(0);
    }
  }

  /** Record name for a document id: role prefix + HMAC(id), so ids (N) are not readable. */
  private async name(id: string): Promise<string> {
    const mac = await globalThis.crypto.subtle.sign("HMAC", this.idxKey, enc.encode(`${this.role}:${id}`));
    return `${this.role}:${toHex(mac)}`;
  }

  private aad(name: string): Uint8Array<ArrayBuffer> {
    return new Uint8Array(enc.encode(`${VERSION}:${name}`));
  }

  /** Stores (or replaces) the document under `id`, for example the invoice's N in hex. */
  async put(id: string, doc: unknown): Promise<void> {
    const name = await this.name(id);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plain = enc.encode(JSON.stringify({ id, doc }));
    const ct = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: this.aad(name) },
      this.encKey,
      plain,
    );
    await this.backend.put({ name, iv, ct: new Uint8Array(ct) });
  }

  private async open(r: StoredRecord): Promise<{ id: string; doc: unknown }> {
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: r.iv, additionalData: this.aad(r.name) },
      this.encKey,
      r.ct,
    );
    return JSON.parse(dec.decode(plain)) as { id: string; doc: unknown };
  }

  /** The document under `id`, or `undefined`. Throws when the record was altered. */
  async get<T = unknown>(id: string): Promise<T | undefined> {
    const r = await this.backend.get(await this.name(id));
    if (!r) return undefined;
    const { id: stored, doc } = await this.open(r);
    if (stored !== id) throw new Error("stored record does not match its id");
    return doc as T;
  }

  /** Every document of this role that decrypts; records that do not are skipped. */
  async list<T = unknown>(): Promise<{ id: string; doc: T }[]> {
    const out: { id: string; doc: T }[] = [];
    for (const r of await this.backend.all()) {
      if (!r.name.startsWith(`${this.role}:`)) continue;
      try {
        const { id, doc } = await this.open(r);
        out.push({ id, doc: doc as T });
      } catch {
        // another passkey's record, or an altered one
      }
    }
    return out;
  }

  async delete(id: string): Promise<void> {
    await this.backend.delete(await this.name(id));
  }
}
