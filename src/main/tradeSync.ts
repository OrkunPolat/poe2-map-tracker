import { net } from "electron";
import {
  RateLimiter, SPLIT_CATEGORIES, TRADE_PRICE_MAX, TRADE_PRICE_MIN, aggregateListings, searchBody, tabDisplayName,
  type SearchExtra, type TradeListing,
} from "../shared/tradeStash";
import { STASH_CATEGORIES } from "../shared/prices";
import type { PriceTable, StashTab } from "../shared/types";
import type { SeenTab } from "../shared/tabCheck";

const API = "https://www.pathofexile.com/api/trade2";
const searchLimiter = new RateLimiter();
const fetchLimiter = new RateLimiter();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(limiter: RateLimiter, url: string, userAgent: string, body?: unknown, onWait?: (s: number) => void): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = limiter.waitMs();
    if (wait > 0) {
      // Count down on screen instead of showing one frozen number for minutes.
      const end = Date.now() + wait;
      for (let left = end - Date.now(); left > 0; left = end - Date.now()) {
        onWait?.(Math.ceil(left / 1000));
        await sleep(Math.min(1000, left));
      }
    }
    limiter.record();
    const res = await net.fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "User-Agent": userAgent, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    limiter.update(res.headers.get("x-rate-limit-ip"));
    limiter.syncState(res.headers.get("x-rate-limit-ip-state"));
    if (res.status === 429) {
      limiter.block(Number(res.headers.get("retry-after")) || 60);
      continue;
    }
    const data = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Trade HTTP ${res.status}: ${data.error?.message ?? ""}`);
    return data;
  }
  throw new Error("Trade sitesi istek sınırı aşıldı, biraz sonra tekrar dene.");
}

interface SearchResult {
  id: string;
  total: number;
  result: string[];
}

export interface TradeSyncProgress {
  (text: string): void;
}

export interface SyncOptions {
  /** Tab prices (990-999) to leave out, e.g. big tabs that rarely change during mapping. */
  skipPrices?: Set<number>;
}

/**
 * All items of the account's public tabs priced 990-999 divine. One search covers everything
 * when it fits the trade site's 100-result page; otherwise each price (one per tab) is searched,
 * and a tab with more than 100 items is split further (sort order, then item category).
 */
export async function syncTradeTabs(
  league: string,
  account: string,
  prices: PriceTable | undefined,
  userAgent: string,
  progress: TradeSyncProgress,
  opts: SyncOptions = {},
): Promise<{ tabs: StashTab[]; truncated: boolean; seen: SeenTab[]; readPrices?: Set<number> }> {
  const searchUrl = `${API}/search/poe2/${encodeURIComponent(league)}`;
  const waitNote = (s: number) => progress(`Trade sınırı: ${s} sn bekleniyor…`);
  const search = (price?: number, extra?: SearchExtra) => call<SearchResult>(searchLimiter, searchUrl, userAgent, searchBody(account, price, extra), waitNote);
  const skip = opts.skipPrices ?? new Set<number>();

  progress("Trade sitesinde aranıyor…");
  // Fetch needs the id of the search that returned each item, so ids are kept per search.
  const groups: Array<{ query: string; ids: string[] }> = [];
  let truncated = false;
  let readPrices: Set<number> | undefined;
  const first = skip.size ? undefined : await search();
  if (first && first.total <= first.result.length) groups.push({ query: first.id, ids: first.result });
  else {
    readPrices = new Set();
    for (let p = TRADE_PRICE_MIN; p <= TRADE_PRICE_MAX; p++) {
      if (skip.has(p)) continue;
      progress(`Sekme ${p} aranıyor…`);
      const s = await search(p);
      readPrices.add(p);
      if (s.total === 0) continue;
      groups.push({ query: s.id, ids: s.result });
      if (s.total <= s.result.length) continue;
      // More than one page: other sort orders and category slices until every item is seen.
      const seenIds = new Set(s.result);
      const add = (r: SearchResult) => {
        const fresh = r.result.filter((id) => !seenIds.has(id));
        fresh.forEach((id) => seenIds.add(id));
        if (fresh.length) groups.push({ query: r.id, ids: fresh });
      };
      add(await search(p, { sort: "indexed-asc" }));
      for (const category of SPLIT_CATEGORIES) {
        if (seenIds.size >= s.total) break;
        progress(`Sekme ${p}: ${seenIds.size}/${s.total} item, kategoriye bölünüyor…`);
        const r = await search(p, { category });
        if (r.total > 0) add(r);
      }
      if (seenIds.size < s.total) truncated = true;
    }
  }

  const listings: TradeListing[] = [];
  const totalIds = groups.reduce((a, g) => a + g.ids.length, 0);
  for (const g of groups) {
    for (let i = 0; i < g.ids.length; i += 10) {
      progress(`Item detayları: ${listings.length}/${totalIds}`);
      const ids = g.ids.slice(i, i + 10).join(",");
      const r = await call<{ result: Array<TradeListing | null> }>(fetchLimiter, `${API}/fetch/${ids}?query=${g.query}`, userAgent, undefined, waitNote);
      listings.push(...r.result.filter((x): x is TradeListing => !!x));
    }
  }

  const categoryOf = (name: string) => STASH_CATEGORIES.find((c) => prices?.byCategory?.[c]?.some((i) => i.name === name));
  const now = Date.now();
  const tabs: StashTab[] = [];
  const seen: SeenTab[] = [];
  const priceOfTab = new Map(listings.map((l) => [l.listing.stash?.name ?? "?", l.listing.price]));
  for (const [tabName, items] of aggregateListings(listings)) {
    const votes = new Map<string, number>();
    for (const n of items.keys()) {
      const c = categoryOf(n);
      if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
    }
    const category = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    seen.push({ stashName: tabName, price: priceOfTab.get(tabName), items: items.size, category });
    tabs.push({
      id: `trade:${tabName}`,
      // The user's own name wins ("~price 991 divine Expedition" -> "Expedition"); else the item category.
      label: tabDisplayName(tabName) ?? category ?? tabName,
      category,
      capturedAt: now,
      screenshot: "",
      source: "trade",
      items: [...items.entries()].map(([name, qty]) => ({ name, qty })),
    });
  }
  return { tabs, truncated, seen, readPrices };
}

/**
 * The account's other public tabs (any price), to spot tabs meant for tracking whose price note
 * is off (wrong currency, out of range, missing). Samples the first 20 listings only.
 */
export async function otherPublicTabs(
  league: string,
  account: string,
  tracked: Set<string>,
  userAgent: string,
  progress: TradeSyncProgress,
): Promise<SeenTab[]> {
  const waitNote = (s: number) => progress(`Diğer sekmeler: trade sınırı, ${s} sn bekleniyor…`);
  const body = {
    query: { status: { option: "any" }, filters: { trade_filters: { filters: { account: { input: account } } } } },
    sort: { price: "desc" },
  };
  const s = await call<SearchResult>(searchLimiter, `${API}/search/poe2/${encodeURIComponent(league)}`, userAgent, body, waitNote);
  const byTab = new Map<string, SeenTab>();
  const ids = s.result.slice(0, 20);
  for (let i = 0; i < ids.length; i += 10) {
    const r = await call<{ result: Array<TradeListing | null> }>(fetchLimiter, `${API}/fetch/${ids.slice(i, i + 10).join(",")}?query=${s.id}`, userAgent, undefined, waitNote);
    for (const l of r.result) {
      const name = l?.listing.stash?.name;
      if (!l || !name || tracked.has(name)) continue;
      const t = byTab.get(name) ?? { stashName: name, price: l.listing.price, items: 0 };
      t.items++;
      byTab.set(name, t);
    }
  }
  return [...byTab.values()];
}
