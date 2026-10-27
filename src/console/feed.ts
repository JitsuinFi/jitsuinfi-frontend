// The desk's one data source (mobile E2E 2, TES-INV-MOB2-13631, finding 1): the in-tray (/node/mail)
// and the deals (/node/console/deals) are read together, so the Desk's "Needs you now", the
// In-tray and the deal screens never disagree. It loads at sign-in, when the Desk or the In-tray
// comes into view, when the window gets focus or the tab is seen again, and every 30 s while the
// page is seen (stopped while hidden). Two asks at once share one request. Pure scheduling: the
// timers and the page's visibility are passed in, so tests run it under Node.

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface Refresher {
  /**
   * Load now, or join the load already on its way. `fresh` (after Accept, Pay, a tap on Refresh):
   * a load that started before the change cannot be trusted, so one more follows it (shared too).
   */
  run(fresh?: boolean): Promise<void>;
  /** The page is seen again (visibilitychange, focus, or the section came into view): load and keep polling. */
  seen(): void;
  /** The page is hidden: stop polling (a load on its way finishes). */
  hidden(): void;
  /** The tab's visibility changed: `seen` or `hidden`, whichever it now is. */
  visibility(): void;
  /** Stop for good (the desk unmounts). */
  stop(): void;
  readonly polling: boolean;
  readonly busy: boolean;
}

export const EVERY_MS = 30_000;

export function refresher(load: () => Promise<void>, opts: { visible: () => boolean; every?: number; timers?: Timers }): Refresher {
  const every = opts.every ?? EVERY_MS;
  const timers: Timers = opts.timers ?? { setInterval: (f, ms) => setInterval(f, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) };
  let inflight: Promise<void> | null = null;
  let next: Promise<void> | null = null;
  let handle: unknown = null;
  let stopped = false;
  const start = (): Promise<void> => {
    const p: Promise<void> = Promise.resolve()
      .then(load)
      .catch(() => undefined)
      .finally(() => {
        if (inflight === p) inflight = null;
      });
    inflight = p;
    return p;
  };
  const run = (fresh = false): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (!inflight) return start();
    if (!fresh) return inflight;
    // one queued load after the one on its way, shared by every fresh ask meanwhile
    if (!next) {
      next = inflight.then(() => {
        next = null;
        return stopped ? undefined : start();
      });
    }
    return next;
  };
  const poll = () => {
    if (stopped || handle !== null || !opts.visible()) return;
    handle = timers.setInterval(() => {
      if (opts.visible()) void run();
      else hidden();
    }, every);
  };
  const hidden = () => {
    if (handle === null) return;
    timers.clearInterval(handle);
    handle = null;
  };
  const seen = () => {
    if (stopped || !opts.visible()) return;
    void run();
    poll();
  };
  return {
    run,
    seen,
    hidden,
    visibility: () => (opts.visible() ? seen() : hidden()),
    stop: () => {
      hidden();
      stopped = true;
    },
    get polling() {
      return handle !== null;
    },
    get busy() {
      return inflight !== null;
    },
  };
}

// ---------- "Needs you now", from the mail and the deals together ----------

export interface NeedMail {
  relay_id: string;
  offer?: { ok: boolean; n?: string; invoice_id?: string; advance_zat?: number; accepted?: unknown; mandate?: { verdict: string } };
}
export interface NeedDeal {
  n: string;
  invoice_id: string;
  state: string;
}

export interface Needs<M extends NeedMail, D extends NeedDeal> {
  /** Offers to accept or decline (not accepted, not already a deal). */
  offers: M[];
  /** Accepted offers the node has not made a deal of yet: the supplier's entry is next. */
  accepted: M[];
  /** Deals waiting for the financier's passkey (the advance). */
  acting: D[];
  /** Deals on the route the node can move on. */
  moving: D[];
  /** Everything else: done or stopped. */
  rest: D[];
  /** Both lists answered and nothing waits for the financier. */
  none: boolean;
  /** Either list not answered yet. */
  loading: boolean;
}

export function needs<M extends NeedMail, D extends NeedDeal>(deals: D[] | null, mail: M[] | null): Needs<M, D> {
  const known = new Set((deals ?? []).map((d) => d.n));
  const ok = (mail ?? []).filter((m) => m.offer?.ok && !(m.offer.n && known.has(m.offer.n)));
  const offers = ok.filter((m) => !m.offer!.accepted);
  // an accepted offer shows only once the deals list answered and does not have it yet
  const accepted = deals ? ok.filter((m) => !!m.offer!.accepted) : [];
  const acting = (deals ?? []).filter((d) => d.state === "Pay");
  const moving = (deals ?? []).filter((d) => !["Pay", "Done", "Stopped"].includes(d.state));
  const rest = (deals ?? []).filter((d) => d.state === "Done" || d.state === "Stopped");
  const loading = mail === null || deals === null;
  return { offers, accepted, acting, moving, rest, loading, none: !loading && !offers.length && !accepted.length && !acting.length && !moving.length };
}

/** "Updated just now" under the phone's Refresh. */
export function updatedLine(at: number | null, now = Date.now(), busy = false, failed = ""): string {
  if (failed) return at === null ? failed : `${failed} Last updated ${ago(at, now)}.`;
  if (at === null) return busy ? "Updating…" : "Not updated yet.";
  return `Updated ${ago(at, now)}`;
}

function ago(at: number, now: number): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 45) return "just now";
  if (s < 90) return "a minute ago";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}
