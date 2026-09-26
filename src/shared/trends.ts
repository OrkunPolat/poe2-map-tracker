import { farmKey } from "./stats";
import type { PriceTable, Run, StashState } from "./types";

export interface SellHint {
  name: string;
  qty: number;
  valueDiv: number;
  change: number;
  /** Divine lost (or gained) over 7 days at this quantity. */
  impactDiv: number;
  advice: "sell" | "hold";
}

/**
 * Sell/hold hints for what is in the stash: items worth at least `minDiv` whose price moved
 * more than `threshold`% in 7 days, biggest money impact first.
 */
export function sellHints(stash: StashState, prices: PriceTable | undefined, minDiv = 1, threshold = 10): SellHint[] {
  if (!prices?.changeByName) return [];
  const qty = new Map<string, number>();
  for (const t of stash.tabs) for (const it of t.items) if (it.qty) qty.set(it.name, (qty.get(it.name) ?? 0) + it.qty);
  const out: SellHint[] = [];
  for (const [name, q] of qty) {
    const unit = prices.divByName[name];
    const change = prices.changeByName[name];
    if (unit == null || change == null) continue;
    const valueDiv = unit * q;
    if (valueDiv < minDiv || Math.abs(change) < threshold) continue;
    // Value a week ago was valueDiv / (1 + change%), so the move in Divine is the difference.
    const impactDiv = valueDiv - valueDiv / (1 + change / 100);
    out.push({ name, qty: q, valueDiv, change, impactDiv, advice: change < 0 ? "sell" : "hold" });
  }
  return out.sort((a, b) => Math.abs(b.impactDiv) - Math.abs(a.impactDiv));
}

/**
 * How a farm's typical loot moved in price over 7 days: loot value weighted average of each
 * item's change. Tells whether a farm is getting better or worse without running it again.
 */
export function farmTrends(runs: Run[], prices: PriceTable | undefined): Map<string, number> {
  const acc = new Map<string, { w: number; wc: number }>();
  if (!prices?.changeByName) return new Map();
  for (const r of runs) {
    const key = farmKey(r);
    const a = acc.get(key) ?? { w: 0, wc: 0 };
    for (const l of r.loot) {
      const change = prices.changeByName[l.name];
      const unit = prices.divByName[l.name];
      if (change == null || unit == null) continue;
      a.w += unit * l.qty;
      a.wc += unit * l.qty * change;
    }
    acc.set(key, a);
  }
  return new Map([...acc].filter(([, a]) => a.w > 0).map(([k, a]) => [k, a.wc / a.w]));
}
