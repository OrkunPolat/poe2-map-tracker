import { net } from "electron";
import {
  RateLimiter, TRADE_PRICE_MAX, TRADE_PRICE_MIN, aggregateListings, searchBody, type TradeListing,
} from "../shared/tradeStash";
import { STASH_CATEGORIES } from "../shared/prices";
import type { PriceTable, StashTab } from "../shared/types";

const API = "https://www.pathofexile.com/api/trade2";
const searchLimiter = new RateLimiter();
const fetchLimiter = new RateLimiter();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(limiter: RateLimiter, url: string, userAgent: string, body?: unknown, onWait?: (s: number) => void): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = limiter.waitMs();
    if (wait > 0) {
      onWait?.(Math.ceil(wait / 1000));
      await sleep(wait);
    }
    limiter.record();
    const res = await net.fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "User-Agent": userAgent, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    limiter.update(res.headers.get("x-rate-limit-ip"));
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

/**
 * All items of the account's public tabs priced 990-999 divine. One search covers everything
 * when it fits the trade site's 100-result page; otherwise each price (one per tab) is searched.
 */
export async function syncTradeTabs(
  league: string,
  account: string,
  prices: PriceTable | undefined,
  userAgent: string,
  progress: TradeSyncProgress,
): Promise<{ tabs: StashTab[]; truncated: boolean }> {
  const searchUrl = `${API}/search/poe2/${encodeURIComponent(league)}`;
  const waitNote = (s: number) => progress(`Trade sınırı: ${s} sn bekleniyor…`);

  progress("Trade sitesinde aranıyor…");
  const first = await call<SearchResult>(searchLimiter, searchUrl, userAgent, searchBody(account), waitNote);
  const searches: SearchResult[] = [];
  if (first.total <= first.result.length) searches.push(first);
  else {
    for (let p = TRADE_PRICE_MIN; p <= TRADE_PRICE_MAX; p++) {
      progress(`Sekme fiyatı ${p} aranıyor…`);
      const s = await call<SearchResult>(searchLimiter, searchUrl, userAgent, searchBody(account, p), waitNote);
      if (s.total > 0) searches.push(s);
    }
  }

  const listings: TradeListing[] = [];
  const truncated = searches.some((s) => s.total > s.result.length);
  for (const s of searches) {
    for (let i = 0; i < s.result.length; i += 10) {
      progress(`Item detayları: ${listings.length}/${searches.reduce((a, x) => a + x.result.length, 0)}`);
      const ids = s.result.slice(i, i + 10).join(",");
      const r = await call<{ result: Array<TradeListing | null> }>(fetchLimiter, `${API}/fetch/${ids}?query=${s.id}`, userAgent, undefined, waitNote);
      listings.push(...r.result.filter((x): x is TradeListing => !!x));
    }
  }

  const categoryOf = (name: string) => STASH_CATEGORIES.find((c) => prices?.byCategory?.[c]?.some((i) => i.name === name));
  const now = Date.now();
  const tabs: StashTab[] = [];
  for (const [tabName, items] of aggregateListings(listings)) {
    const votes = new Map<string, number>();
    for (const n of items.keys()) {
      const c = categoryOf(n);
      if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
    }
    const category = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    tabs.push({
      id: `trade:${tabName}`,
      label: `${category ?? "Sekme"} (${tabName})`,
      category,
      capturedAt: now,
      screenshot: "",
      source: "trade",
      items: [...items.entries()].map(([name, qty]) => ({ name, qty })),
    });
  }
  return { tabs, truncated };
}
