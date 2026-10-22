// The landing world (HNK-31.T2): the chapters still mount as DOM (src/landing/*), inside
// <div id="landing"> on <body class="landing">, as index.html had it. Mounted once.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { mountLanding } from "../landing/main";

export function Landing(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    if (done.current || !root.current) return;
    done.current = true;
    document.body.classList.add("landing");
    document.title = "JitsuinFi";
    mountLanding(root.current);
  }, []);
  return <div id="landing" ref={root} />;
}
