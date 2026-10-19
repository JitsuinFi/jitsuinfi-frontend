// The landing's jitsuin-wasm, loaded once, lazily, the first time a chapter needs it.
export type Wasm = typeof import("../wasm/jitsuin_wasm.js");

let ready: Promise<Wasm> | null = null;

export function loadWasm(): Promise<Wasm> {
  ready ??= import("../wasm/jitsuin_wasm.js").then(async (m) => {
    await m.default();
    return m;
  });
  return ready;
}

/** SHA-256 of a label, as hex: the landing's test keys come from TES- labels, never stored. */
export async function labelKey(label: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(label));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
