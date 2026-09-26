import type { PriceTable, Run, StashTab } from "./types";
import { tabPrice } from "./tradeStash";

export type Qty = Record<string, number>;

/**
 * Item counts across the tabs read from the trade site (what the automatic diff compares).
 * `excludePrices` leaves out tabs that are not re-read every map, so their stale contents
 * cannot show up as one map's loot when they finally are.
 */
export function stashQty(tabs: StashTab[], excludePrices: Set<number> = new Set()): Qty {
  const q: Qty = {};
  for (const t of tabs) {
    if (t.source !== "trade") continue;
    const p = tabPrice(t.id.replace(/^trade:/, ""));
    if (p != null && excludePrices.has(p)) continue;
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

/** Price per unit: frozen at reading time, else today's (incl. prices the user entered). */
const unit = (it: { name: string; unitDiv?: number }, prices?: PriceTable) => it.unitDiv ?? prices?.divByName[it.name];

/**
 * Gain and spending of a map's stash diff, leaving out ignored lines. Items without any price
 * count as 0 and are listed so the user can give them one.
 */
export function stashLootTotals(run: Pick<Run, "stashLoot">, prices?: PriceTable) {
  const sl = run.stashLoot;
  let gainDiv = 0;
  let spentDiv = 0;
  const unpriced: string[] = [];
  if (!sl) return { gainDiv, spentDiv, unpriced };
  const ignored = new Set(sl.ignored ?? []);
  for (const it of sl.items) {
    if (ignored.has(it.name)) continue;
    const u = unit(it, prices);
    if (u == null) {
      unpriced.push(it.name);
      continue;
    }
    const v = it.qty * u;
    if (v > 0) gainDiv += v;
    else spentDiv -= v;
  }
  return { gainDiv, spentDiv, unpriced };
}

/** Currencies a map cannot consume: if these go down, something else happened (trade, craft). */
const NOT_SPENT_IN_MAPS = new Set(["Divine Orb", "Exalted Orb", "Chaos Orb", "Orb of Annulment", "Greater Exalted Orb", "Perfect Exalted Orb", "Mirror of Kalandra"]);

/**
 * Reasons a map's stash diff looks like it contains more than the map itself. `medianGain` is
 * the typical automatic gain of other maps, to catch a sale landing in one map.
 */
export function stashLootWarnings(run: Pick<Run, "stashLoot">, prices: PriceTable | undefined, medianGain: number): string[] {
  const sl = run.stashLoot;
  if (!sl) return [];
  const ignored = new Set(sl.ignored ?? []);
  const out: string[] = [];
  for (const it of sl.items) {
    if (ignored.has(it.name) || it.qty >= 0 || !NOT_SPENT_IN_MAPS.has(it.name)) continue;
    const v = -it.qty * (unit(it, prices) ?? 0);
    if (it.name === "Divine Orb" || v >= 2) out.push(`${-it.qty} ${it.name} azaldı (trade/craft?)`);
  }
  const { gainDiv } = stashLootTotals(run, prices);
  if (medianGain > 0 && gainDiv >= 30 && gainDiv > medianGain * 8) out.push(`kazanç normalin ${Math.round(gainDiv / medianGain)} katı (satış?)`);
  return out;
}

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
