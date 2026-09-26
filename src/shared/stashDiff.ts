import type { PriceTable, Run, StashTab } from "./types";

export type Qty = Record<string, number>;

/** Item counts across the tabs read from the trade site (what the automatic diff compares). */
export function stashQty(tabs: StashTab[]): Qty {
  const q: Qty = {};
  for (const t of tabs) {
    if (t.source !== "trade") continue;
    for (const it of t.items) if (it.qty) q[it.name] = (q[it.name] ?? 0) + it.qty;
  }
  return q;
}

export function diffQty(before: Qty, after: Qty): Qty {
  const d: Qty = {};
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const n = (after[name] ?? 0) - (before[name] ?? 0);
    if (n !== 0) d[name] = n;
  }
  return d;
}

export type StashLoot = NonNullable<Run["stashLoot"]>;

/**
 * What one map changed in the stash: items that came in are loot, items that went out were
 * spent on the map (omens, splinters...). Prices are frozen at the time of the reading.
 */
export function toStashLoot(delta: Qty, prices: PriceTable | undefined, beforeAt: number, afterAt: number): StashLoot {
  const items = Object.entries(delta)
    .map(([name, qty]) => ({ name, qty, unitDiv: prices?.divByName[name] }))
    .sort((a, b) => Math.abs(b.qty * (b.unitDiv ?? 0)) - Math.abs(a.qty * (a.unitDiv ?? 0)));
  let gainDiv = 0;
  let spentDiv = 0;
  for (const it of items) {
    const v = it.qty * (it.unitDiv ?? 0);
    if (v > 0) gainDiv += v;
    else spentDiv -= v;
  }
  return { items, gainDiv, spentDiv, beforeAt, afterAt };
}
