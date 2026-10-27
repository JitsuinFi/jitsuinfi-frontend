// Verdict text of a verification bundle on the Verify screen (HNK-28.T4, BL-D28-04): says only
// what the bundle proves. "Every seal checks out" appears only when the assignment letter is
// sealed by supplier, buyer and financier. Pure data, no wasm: tests run it under Node.

export interface Verdict {
  kind: "ok" | "warn" | "bad";
  title: string;
  text: string;
}

/** `assignment` as wasm `verifyBundle` reports it: null, "Sealed" or "AwaitingSeal:<Role>". */
export function bundleVerdict(assignment: string | null): Verdict {
  if (assignment === null) {
    return {
      kind: "ok",
      title: "Invoice is genuine",
      text: "The buyer signed this invoice. This file carries no letter to a financier, so it does not show that the invoice was financed.",
    };
  }
  if (assignment === "Sealed") {
    return {
      kind: "ok",
      // mobile E2E 2, finding 9: plain words on screen 1 (no "bundle", "assignment")
      title: "The deal is genuine",
      text: "The buyer signed this invoice and every seal on the letter to the financier checks out: supplier, buyer and financier.",
    };
  }
  const next = assignment.startsWith("AwaitingSeal:") ? assignment.slice("AwaitingSeal:".length).toLowerCase() : "";
  if (!next) throw new Error(`unknown letter status ${assignment}`);
  return {
    kind: "warn",
    title: "The letter is not fully sealed",
    text: `The buyer signed this invoice and the seals present check out, but the letter still waits for the ${next}'s seal. It does not prove a financed deal yet.`,
  };
}

/** Letter row of the details table. */
export function letterStatus(assignment: string | null): string {
  if (assignment === null) return "not included";
  if (assignment === "Sealed") return "sealed by supplier, buyer and financier";
  return `waiting for the ${assignment.replace("AwaitingSeal:", "").toLowerCase()}'s seal`;
}
