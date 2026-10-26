// The phone layout (DS-MOB L1, compact: style.css and shell.css, the tab bar below 600 px), as a
// hook. Its own module so the shell's parts (the outcome line, the inbox panel) can use it too.
import { useSyncExternalStore } from "react";

export const PHONE = "(max-width: 599px)";

export function usePhone(): boolean {
  return useSyncExternalStore(
    (f) => {
      const mq = matchMedia(PHONE);
      mq.addEventListener("change", f);
      return () => mq.removeEventListener("change", f);
    },
    () => matchMedia(PHONE).matches,
  );
}
