// The financier's display name: the node sends it only to an invite-code holder or a signed-in
// console, never on a public endpoint. This browser keeps it to greet the financier at log in.
const KEY = "jitsuin.console.name";

export function keepName(name: string | null | undefined): void {
  if (!name) return;
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* storage blocked: no greeting next time */
  }
}

export function keptName(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
