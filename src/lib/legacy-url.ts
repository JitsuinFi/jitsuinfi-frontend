// Old addresses (before HNK-31): the app lived at /app.html with hash routes (#/supplier), the
// console at /console.html (?view=pair). Links in READMEs, invites and older pages still use them,
// so they are moved to the clean paths. Pure, tested under Node.

/** The clean path of an app hash route: "/" was the lobby, "/index" the rate index. */
function page(p: string): string {
  if (p === "/" || p === "") return "/app";
  if (p === "/index") return "/rates";
  return p;
}

/** Where an old address now lives, or null when it is already a current one. */
export function legacyTarget(pathname: string, search: string, hash: string): string | null {
  const route = /^#(\/[^?#]*)/.exec(hash)?.[1];
  if (pathname === "/app.html") return route ? page(route) : "/app";
  if (pathname === "/console.html") return new URLSearchParams(search).get("view") === "pair" ? "/console/pair" : "/console";
  if (pathname === "/index.html") return "/";
  // a hash route on any page: the old in-app links (#/supplier) and location.hash = "#/buyer"
  if (route && !pathname.startsWith("/console")) return page(route);
  return null;
}
