// The financier console world (HNK-31.T2, D-45): still DOM builders (src/console/*) inside
// <div id="console">, talking to the node through /node/* on this origin. Mounted once.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { mountConsole } from "../console/main";

export function Console(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    if (done.current || !root.current) return;
    done.current = true;
    document.title = "Financier console · JitsuinFi";
    mountConsole(root.current);
  }, []);
  return <div id="console" ref={root} />;
}
