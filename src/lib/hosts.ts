// Where the three worlds live in production (HNK-31, D-45): the app, the demo console the judges
// try, and the financiers' console. Each console is its own Vercel project on its own origin, so a
// link from a console to the app goes to the app's host; on any other host (the app itself, a
// local preview) the app is this origin. Pure: tests run it under Node.

export const APP_ORIGIN = "https://jitsuinfi.vercel.app";
export const CONSOLE_DEMO_URL = "https://jitsuinfi-console-demo.vercel.app/console";
export const CONSOLE_URL = "https://jitsuinfi-console.vercel.app/console";
/** The financiers' console host, as people read it. */
export const CONSOLE_HOST = "jitsuinfi-console.vercel.app";

/** True on a console's own host (the demo console or the financiers' console). */
export function isConsoleHost(hostname: string): boolean {
  return /^jitsuinfi-console[a-z0-9-]*\.vercel\.app$/.test(hostname);
}

/** A link to an app path: the app's host from a console, this origin anywhere else. */
export function appHref(path: string, hostname: string): string {
  return isConsoleHost(hostname) ? `${APP_ORIGIN}${path}` : path;
}

/** The registry's specification, as the landing links it. */
export const SPEC_URL = "https://github.com/JitsuinFi/jitsuinfi-zcash/blob/main/docs/zip-shielded-receivable-registry.md";
