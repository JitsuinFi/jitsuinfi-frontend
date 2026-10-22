// The financier console world (HNK-31.T2, T11, D-45): <div id="console">, talking to the node
// through /node/* on this origin.
import { useLayoutEffect, type ReactNode } from "react";
import { ConsoleApp } from "../console/ConsoleApp";

export function Console(): ReactNode {
  useLayoutEffect(() => {
    document.title = "Financier console · JitsuinFi";
  }, []);
  return (
    <div id="console">
      <ConsoleApp />
    </div>
  );
}
