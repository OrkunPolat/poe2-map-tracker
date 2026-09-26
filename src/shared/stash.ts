import type { CurrencyUnit, PriceTable, Settings, StashState, StashTab } from "./types";
import { TRADE_PRICE_MAX, TRADE_PRICE_MIN, tabPrice } from "./tradeStash";

export const emptyStash = (): StashState => ({ tabs: [], history: [] });

/** Divine value of one unit of a currency (undefined when poe.ninja has no price for it). */
export function unitDiv(unit: CurrencyUnit, prices?: PriceTable): number | undefined {
  if (unit === "div") return 1;
  return prices?.divByName[unit === "ex" ? "Exalted Orb" : "Chaos Orb"];
}

/** The stash filter as a Divine threshold per item; 0 means no filter. */
export function minItemDiv(settings: Pick<Settings, "stashMinValue">, prices?: PriceTable): number {
  const f = settings.stashMinValue;
  if (!f || !(f.amount > 0)) return 0;
  return f.amount * (unitDiv(f.unit, prices) ?? 0);
}

/** Items below the threshold count as if they were not in the stash. Unpriced items stay visible. */
export function itemVisible(name: string, prices: PriceTable | undefined, minDiv: number): boolean {
  if (!minDiv) return true;
  const u = prices?.divByName[name];
  return u == null || u >= minDiv;
}

export function filterStash(stash: StashState, prices: PriceTable | undefined, minDiv: number): StashState {
  if (!minDiv) return stash;
  return { ...stash, tabs: stash.tabs.map((t) => ({ ...t, items: t.items.filter((i) => itemVisible(i.name, prices, minDiv)) })) };
}

export function tabValueDiv(tab: StashTab, prices?: PriceTable, minDiv = 0): number {
  return tab.items.reduce((s, it) => s + (itemVisible(it.name, prices, minDiv) ? (it.qty ?? 0) * (prices?.divByName[it.name] ?? 0) : 0), 0);
}

export function stashValueDiv(stash: StashState, prices?: PriceTable, minDiv = 0): number {
  return stash.tabs.reduce((s, t) => s + tabValueDiv(t, prices, minDiv), 0);
}

/** A re-read of the same tab replaces it; counts the user typed in survive if the item is still there. */
export function upsertTab(stash: StashState, tab: StashTab): StashState {
  const prev = stash.tabs.find((t) => t.id === tab.id);
  const items = tab.items.map((it) => {
    const old = prev?.items.find((o) => o.name === it.name);
    return it.qty == null && old?.edited ? { ...it, qty: old.qty, edited: true } : it;
  });
  const merged = { ...tab, items };
  return { ...stash, tabs: prev ? stash.tabs.map((t) => (t.id === tab.id ? merged : t)) : [...stash.tabs, merged] };
}

/**
 * Trade-synced tabs are replaced as a set: a tab no longer public disappears. When only some
 * tab prices were read (automatic read skipping big tabs), the other trade tabs are kept as they were.
 */
export function replaceTradeTabs(stash: StashState, tabs: StashTab[], readPrices?: Set<number>): StashState {
  const keep = stash.tabs.filter((t) => {
    if (t.source !== "trade") return true;
    if (!readPrices) return false;
    const p = tabPrice(t.id.replace(/^trade:/, ""));
    return p != null && p >= TRADE_PRICE_MIN && p <= TRADE_PRICE_MAX && !readPrices.has(p);
  });
  return { ...stash, tabs: [...keep, ...tabs] };
}

export function setItemQty(stash: StashState, tabId: string, name: string, qty: number | undefined): StashState {
  return {
    ...stash,
    tabs: stash.tabs.map((t) =>
      t.id !== tabId ? t : { ...t, items: t.items.map((i) => (i.name === name ? { ...i, qty, edited: true } : i)).filter((i) => i.qty !== 0) },
    ),
  };
}
