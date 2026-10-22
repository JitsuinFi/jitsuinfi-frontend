// Financier console (HNK-26.T21, D-45): served by its own Vercel project (own origin, so the
// supplier and buyer app never shares its cookies), talking to the financier's node through
// /node/* on this origin. Same sign-in sheet and palette as the app (src/auth.css, DS-PAL).
import "../auth.css";
import "./console.css";
import { h } from "../lib/ui";
import { homeView } from "./home";
import { pairView } from "./pair";

const isPair = () => location.pathname.endsWith("/pair") || new URLSearchParams(location.search).get("view") === "pair";

/** Mounts the console into `app` (HNK-31: called by the Console route). */
export function mountConsole(app: HTMLElement): void {
  const render = async (): Promise<void> => {
  try {
    app.replaceChildren(isPair() ? pairView() : await homeView(render));
  } catch (e) {
    app.replaceChildren(h("main", { class: "auth" }, h("section", { class: "auth-sheet" }, h("h1", { class: "auth-title" }, "The node did not answer"), h("p", { class: "auth-sub" }, e instanceof Error ? e.message : String(e)))));
    }
  };
  void render();
}
