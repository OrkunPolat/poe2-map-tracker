import { useEffect, useState } from "react";
import type { Api, Snapshot } from "../shared/ipc";

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

export function fmtEx(div: number, exPerDiv?: number): string {
  return exPerDiv ? `${Math.round(div * exPerDiv).toLocaleString("tr-TR")} ex` : "";
}
