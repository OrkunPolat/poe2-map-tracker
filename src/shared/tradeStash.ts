/**
 * Reads the user's own public stash tabs through the PoE2 trade site, the way PoE Overlay does:
 * each tab is set to Public and named with a price note ("~price 991 divine"), so every item in
 * it is listed at that price. Searching the trade site for the account's items at 990-999 divine
 * then returns exactly those tabs, with stack sizes and tab names.
 */

export const TRADE_PRICE_MIN = 990;
export const TRADE_PRICE_MAX = 999;
export const TRADE_PRICE_CURRENCY = "divine";

export interface TradeListing {
  id: string;
  listing: { stash?: { name: string }; price?: { amount: number; currency: string }; account?: { name: string } };
  item: { name?: string; typeLine?: string; baseType?: string; stackSize?: number; frameType?: number };
}

export function searchBody(account: string, price?: number) {
  // Test hook: POE2T_TRADE_PRICE="1-1:exalted" searches another price band (e.g. a real seller's tabs).
  const override = typeof process !== "undefined" ? process.env.POE2T_TRADE_PRICE?.match(/^(\d+)-(\d+):(\w[\w-]*)$/) : null;
  if (override) {
    return {
      query: {
        status: { option: "any" },
        filters: { trade_filters: { filters: { account: { input: account }, price: { option: override[3], min: Number(override[1]), max: Number(override[2]) } } } },
      },
      sort: { price: "asc" },
    };
  }
  return {
    query: {
      status: { option: "any" },
      filters: {
        trade_filters: {
          filters: {
            account: { input: account },
            price: { option: TRADE_PRICE_CURRENCY, min: price ?? TRADE_PRICE_MIN, max: price ?? TRADE_PRICE_MAX },
          },
        },
      },
    },
    sort: { price: "asc" },
  };
}

const PRICE_NOTE = /~(?:price|b\/o)\s+[\d.,\/]+\s+[\w-]+/i;

/**
 * Readable tab name: the text around the price note. "~price 991 divine Expedition" -> "Expedition".
 * The game accepts extra text before or after the note (checked on live trade listings).
 */
export function tabDisplayName(stashName: string): string | undefined {
  const rest = stashName.replace(PRICE_NOTE, " ").replace(/\s+/g, " ").trim();
  return rest || undefined;
}

/** Display name: uniques are "Name BaseType" on trade; stackables are just the type line. */
export function listingItemName(l: TradeListing): string {
  const { name, typeLine, baseType } = l.item;
  return name ? `${name}` : (typeLine ?? baseType ?? "?");
}

/** Groups listings by stash tab and sums stack sizes per item. */
export function aggregateListings(listings: TradeListing[]): Map<string, Map<string, number>> {
  const tabs = new Map<string, Map<string, number>>();
  const seen = new Set<string>();
  for (const l of listings) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    const tab = l.listing.stash?.name ?? "?";
    const items = tabs.get(tab) ?? new Map<string, number>();
    const name = listingItemName(l);
    items.set(name, (items.get(name) ?? 0) + (l.item.stackSize ?? 1));
    tabs.set(tab, items);
  }
  return tabs;
}

/**
 * Client-side limiter driven by the server's own X-Rate-Limit headers
 * ("max:period:penalty,..." rules). Keeps one request of headroom under every rule.
 */
export class RateLimiter {
  private rules: Array<{ max: number; periodMs: number }> = [{ max: 3, periodMs: 10_000 }];
  private hits: number[] = [];
  private blockedUntil = 0;

  constructor(private now: () => number = Date.now) {}

  update(rulesHeader: string | null) {
    if (!rulesHeader) return;
    const rules = rulesHeader
      .split(",")
      .map((r) => r.split(":").map(Number))
      .filter((r) => r.length >= 2 && r.every(Number.isFinite))
      .map(([max, period]) => ({ max: max!, periodMs: period! * 1000 }));
    if (rules.length) this.rules = rules;
  }

  /**
   * Aligns with the server's own count ("hits:period:restricted,..."), which also includes
   * requests from other tools on the same IP (PoE Overlay, Exiled Exchange...).
   */
  syncState(stateHeader: string | null) {
    if (!stateHeader) return;
    const t = this.now();
    stateHeader.split(",").forEach((part, i) => {
      const [hits, period, restricted] = part.split(":").map(Number);
      if (restricted && restricted > 0) this.block(restricted);
      const rule = this.rules[i];
      if (!rule || !hits || period == null || !Number.isFinite(hits)) return;
      const local = this.hits.filter((h) => h > t - period * 1000).length;
      // Other tools used part of this window: count their requests as if made just now.
      for (let k = local; k < hits; k++) this.hits.push(t);
    });
  }

  block(seconds: number) {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + seconds * 1000);
  }

  /** Milliseconds to wait before the next request is safe. */
  waitMs(): number {
    const t = this.now();
    let wait = Math.max(0, this.blockedUntil - t);
    for (const { max, periodMs } of this.rules) {
      const inWindow = this.hits.filter((h) => h > t - periodMs).sort((a, b) => a - b);
      const allowed = Math.max(1, max - 1);
      if (inWindow.length >= allowed) {
        const oldest = inWindow[inWindow.length - allowed]!;
        wait = Math.max(wait, oldest + periodMs - t + 50);
      }
    }
    return wait;
  }

  record() {
    const t = this.now();
    this.hits.push(t);
    const longest = Math.max(...this.rules.map((r) => r.periodMs));
    this.hits = this.hits.filter((h) => h > t - longest);
  }
}
