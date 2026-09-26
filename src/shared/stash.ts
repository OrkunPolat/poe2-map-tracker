import type { PriceTable, StashState, StashTab } from "./types";

export const emptyStash = (): StashState => ({ tabs: [], history: [] });

export function tabValueDiv(tab: StashTab, prices?: PriceTable): number {
  return tab.items.reduce((s, it) => s + (it.qty ?? 0) * (prices?.divByName[it.name] ?? 0), 0);
}

export function stashValueDiv(stash: StashState, prices?: PriceTable): number {
  return stash.tabs.reduce((s, t) => s + tabValueDiv(t, prices), 0);
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

export function setItemQty(stash: StashState, tabId: string, name: string, qty: number | undefined): StashState {
  return {
    ...stash,
    tabs: stash.tabs.map((t) =>
      t.id !== tabId ? t : { ...t, items: t.items.map((i) => (i.name === name ? { ...i, qty, edited: true } : i)).filter((i) => i.qty !== 0) },
    ),
  };
}
