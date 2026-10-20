// Fund member screen (HNK-22.T2, BL-D21-06): a member holds no signing key, only an inbox key,
// so this screen never asks for a stamp. Receipts and Merkle paths arrive in the inbox once the
// relay exists (HNK-22.T6, HNK-23).
import { account } from "../lib/app-session";
import { banner, card, kv, page } from "../lib/ui";

export function memberPage(): HTMLElement {
  const s = account.current!;
  return page(
    "Fund member",
    "See what the fund holds for you, without signing anything.",
    card(
      "Inbox",
      "Your receipts",
      "The fund sends your receipts and the Merkle path of your share to your inbox. Nothing here needs a signature.",
      kv([["Key fingerprint", s.fingerprint, true]]),
      banner("warn", "Inbox not connected yet", "Receipts arrive once the document relay is live."),
    ),
  );
}
