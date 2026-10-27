// A letter about a record another device holds (messy-state E2E 2026-10-27): the same passkey on
// a phone and a laptop opens one mailbox, but each device keeps its own invoices. A letter about an
// invoice this device does not hold is shown, not counted and not acted on: it stays in the
// mailbox for the device that holds the invoice.
//
// Pure: tests run it under Node.
import type { Handler, Handlers } from "../app/inbox.ts";
import type { MessageType } from "./relay-message.ts";

/**
 * Marks each handler except `except` as tied to a record kept on one device: a letter about an
 * invoice `here` does not find is for another device with the same passkey.
 */
export function tiedTo(h: Handlers, here: (n: string) => Promise<boolean>, except: MessageType[]): Handlers {
  const out: Handlers = {};
  for (const [t, x] of Object.entries(h) as Array<[MessageType, Handler]>) {
    out[t] = except.includes(t) ? x : { ...x, elsewhere: async (r) => !(await here(r.message.header.n ?? "")) };
  }
  return out;
}

