// The landing's language for React components (HNK-31.T4): `t` from i18n.ts, and a repaint on
// every EN/中文 switch, as `tx` and `ta` rewrite bound DOM nodes.
import { useEffect, useReducer } from "react";
import { subscribeLang, t } from "./i18n";

export function useT(): typeof t {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeLang(bump), []);
  return t;
}
