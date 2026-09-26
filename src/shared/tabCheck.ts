import { tabDisplayName, TRADE_PRICE_CURRENCY, TRADE_PRICE_MAX, TRADE_PRICE_MIN } from "./tradeStash";

/** Suggested public tabs: one price per tab so each can be searched on its own. */
export const SUGGESTED_TABS: Array<{ price: number; name: string; category: string }> = [
  { price: 990, name: "Currency", category: "Currency" },
  { price: 991, name: "Expedition", category: "Expedition" },
  { price: 992, name: "Ritual", category: "Ritual" },
  { price: 993, name: "Breach", category: "Breach" },
  { price: 994, name: "Abyss", category: "Abyss" },
  { price: 995, name: "Delirium", category: "Delirium" },
  { price: 996, name: "Essence", category: "Essences" },
  { price: 997, name: "Fragment", category: "Fragments" },
  { price: 998, name: "Rune", category: "Runes" },
];

export const suggestedName = (t: { price: number; name: string }) => `~price ${t.price} ${TRADE_PRICE_CURRENCY} ${t.name}`;

export interface SeenTab {
  stashName: string;
  price?: { amount: number; currency: string };
  items: number;
  /** poe.ninja category most items belong to. */
  category?: string;
}

export type TabIssue =
  | { kind: "ok"; tab: string; items: number }
  | { kind: "missing"; suggested: string }
  | { kind: "noName"; tab: string }
  | { kind: "duplicatePrice"; tabs: string[]; price: number }
  | { kind: "wrongNote"; tab: string; hint: string };

const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Compares what the trade site shows for the account with the suggested setup.
 * `tracked` are tabs priced 990-998 divine; `others` are the account's other public tabs.
 */
export function checkTabs(tracked: SeenTab[], others: SeenTab[], notRead: Set<number> = new Set()): TabIssue[] {
  const issues: TabIssue[] = [];
  const byPrice = new Map<number, SeenTab[]>();
  for (const t of tracked) {
    const p = t.price?.amount ?? -1;
    byPrice.set(p, [...(byPrice.get(p) ?? []), t]);
  }
  for (const [price, tabs] of byPrice) if (tabs.length > 1) issues.push({ kind: "duplicatePrice", price, tabs: tabs.map((t) => t.stashName) });

  for (const t of tracked) {
    const name = tabDisplayName(t.stashName);
    if (!name) {
      issues.push({ kind: "noName", tab: t.stashName });
      continue;
    }
    // Whatever a tab holds is shown as read; its name is only a label.
    issues.push({ kind: "ok", tab: t.stashName, items: t.items });
  }

  // Public tabs that look meant for tracking but whose price note does not match 990-998 divine.
  for (const t of others) {
    // The old gem tab (999) is deliberately not tracked.
    if (t.price?.currency === TRADE_PRICE_CURRENCY && t.price.amount === 999) continue;
    const name = tabDisplayName(t.stashName) ?? t.stashName;
    const looksMeant = SUGGESTED_TABS.some((s) => clean(name).includes(clean(s.name).slice(0, 4))) || (t.price && t.price.amount >= 90);
    if (!looksMeant) continue;
    const p = t.price;
    const hint = !p
      ? `fiyat notu yok; adı "${suggestedName({ price: TRADE_PRICE_MIN, name })}" gibi olmalı`
      : p.currency !== TRADE_PRICE_CURRENCY
        ? `para birimi "${p.currency}", "${TRADE_PRICE_CURRENCY}" olmalı`
        : `fiyat ${p.amount}, ${TRADE_PRICE_MIN}-${TRADE_PRICE_MAX} arası olmalı`;
    issues.push({ kind: "wrongNote", tab: t.stashName, hint });
  }

  for (const s of SUGGESTED_TABS) {
    if (notRead.has(s.price)) continue; // read later in the background, not missing
    const found = tracked.some((t) => {
      const n = tabDisplayName(t.stashName);
      return (n && clean(n).startsWith(clean(s.name).slice(0, 4))) || t.category === s.category;
    });
    if (!found) issues.push({ kind: "missing", suggested: suggestedName(s) });
  }
  return issues;
}
