// The app's one account session (HNK-22): real passkeys, localStorage for the non-secret profile,
// the encrypted deal store, and input that keeps the session from locking.
import { openDealStore } from "./core";
import { evaluatePrf, registerPasskey } from "./passkey";
import { Account } from "./session";

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked site data: sign-in still works, the profile is not kept
  }
}

export const account = new Account({
  keys: { register: registerPasskey, evaluate: evaluatePrf },
  profile: localStore(),
  openStore: openDealStore,
});

for (const ev of ["pointerdown", "keydown"]) {
  window.addEventListener(ev, () => account.touch(), { passive: true });
}

/**
 * Set by the nav's Sign in: the account page then opens afresh, on log-in when this device knows
 * an account and on sign-up when it does not (the landing's Sign in loads a new document, the same).
 */
export const accountDoor = { fresh: false };
