import { useEffect, useState } from "react";
import type { Api, Snapshot } from "../shared/ipc";
import type { PriceTable } from "../shared/types";

declare global {
  interface Window {
    api: Api;
  }
}

export const api = (): Api => window.api;

export function useSnapshot(): Snapshot | undefined {
  const [snap, setSnap] = useState<Snapshot>();
  useEffect(() => {
    let alive = true;
    void api().getSnapshot().then((s) => alive && setSnap(s));
    const off = api().onSnapshot(setSnap);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return snap;
}

/** Re-render every second for live timers. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export const fmtDiv = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

/** Small amounts read better in Exalted ("0.00 div" hides a 1-ex drop). */
export function fmtValue(div: number, exPerDiv?: number): string {
  if (exPerDiv && div > 0 && div < 0.1) {
    const ex = div * exPerDiv;
    return ex < 1 ? "<1 ex" : `${Math.round(ex).toLocaleString("tr-TR")} ex`;
  }
  return `${fmtDiv(div)} div`;
}

/** Exalted Orbs per Chaos Orb (in PoE2 a Chaos is worth several Exalts), rounded for display. */
export function exPerChaos(prices?: PriceTable): string | undefined {
  const ex = prices?.divByName["Exalted Orb"];
  const c = prices?.divByName["Chaos Orb"];
  if (!ex || !c) return undefined;
  const r = c / ex;
  return r >= 10 ? String(Math.round(r)) : r.toFixed(1).replace(".", ",");
}

export function fmtEx(div: number, exPerDiv?: number): string {
  return exPerDiv ? `${Math.round(div * exPerDiv).toLocaleString("tr-TR")} ex` : "";
}
