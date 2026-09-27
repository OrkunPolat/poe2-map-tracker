import type { ParsedItem, ParsedMod } from "./itemParse";
import type { PriceTable } from "./types";

/** One mod line in the price check window: whether it is part of the search and its min/max. */
export interface ModFilter {
  statId: string;
  /** Other groups' ids for the same line (implicit or rune); any one of them matches. */
  altIds?: string[];
  enabled: boolean;
  min?: number;
  max?: number;
}

export interface PriceCheckQuery {
  /** Search this exact unique / rare name (off: any item with the chosen mods). */
  useName: boolean;
  /** Restrict to the base type, e.g. "War Wraps" (off: the whole item class). */
  useBase: boolean;
  /** Trade category of the item class, e.g. "armour.gloves"; used when the base is off. */
  category?: string;
  ilvlMin?: number;
  corrupted: "any" | "yes" | "no";
  /** Online sellers only (like the trade site's default) or everyone. */
  online: boolean;
  mods: ModFilter[];
}

/** Default state of the window: nothing selected, mins a little under the rolled value so similar items show. */
export function defaultQuery(item: ParsedItem, category?: string): PriceCheckQuery {
  return {
    useName: item.rarity === "unique",
    useBase: item.rarity !== "unique",
    category,
    corrupted: "any",
    online: true,
    mods: item.mods.filter((m) => m.statId).map((m) => ({ statId: m.statId!, ...(m.altIds ? { altIds: m.altIds } : {}), enabled: false, min: defaultMin(m) })),
  };
}

export function defaultMin(m: ParsedMod): number | undefined {
  const v = m.values[0];
  if (v == null) return undefined;
  if (v < 0) return undefined;
  // 90% of the roll, whole numbers for whole rolls, never below the bottom of its range.
  // Small whole rolls (+1 level, 3 charges) keep their value: 90% of them rounds down to something else.
  const min = Number.isInteger(v) ? (v <= 10 ? v : Math.floor(v * 0.9)) : Math.floor(v * 0.9 * 10) / 10;
  return m.range ? Math.max(m.range[0], min) : min;
}

/** Body for POST api/trade2/search/poe2/{league}, cheapest first. */
export function tradeQuery(item: ParsedItem, q: PriceCheckQuery): unknown {
  const value = (m: ModFilter) => ({ ...(m.min != null ? { min: m.min } : {}), ...(m.max != null ? { max: m.max } : {}) });
  const on = q.mods.filter((m) => m.enabled);
  const filters = on.filter((m) => !m.altIds?.length).map((m) => ({ id: m.statId, disabled: false, value: value(m) }));
  // A line that may be implicit or rune: "at least one of" these ids.
  const either = on
    .filter((m) => m.altIds?.length)
    .map((m) => ({ type: "count", value: { min: 1 }, filters: [m.statId, ...m.altIds!].map((id) => ({ id, disabled: false, value: value(m) })) }));
  const typeFilters: Record<string, unknown> = {};
  if (!q.useBase && q.category) typeFilters.category = { option: q.category };
  if (q.ilvlMin != null) typeFilters.ilvl = { min: q.ilvlMin };
  // A rare searched without its name should not bring back uniques of the same base, and vice versa.
  if (!q.useName) typeFilters.rarity = { option: item.rarity === "unique" ? "unique" : "nonunique" };
  const misc: Record<string, unknown> = {};
  if (q.corrupted !== "any") misc.corrupted = { option: q.corrupted === "yes" ? "true" : "false" };
  return {
    query: {
      status: { option: q.online ? "online" : "any" },
      ...(q.useName && item.name && item.rarity === "unique" ? { name: item.name } : {}),
      ...(q.useBase && item.baseType ? { type: item.baseType } : {}),
      stats: [{ type: "and", filters }, ...either],
      filters: {
        ...(Object.keys(typeFilters).length ? { type_filters: { filters: typeFilters } } : {}),
        ...(Object.keys(misc).length ? { misc_filters: { filters: misc } } : {}),
      },
    },
    sort: { price: "asc" },
  };
}

/** Trade category option for an item class from the tooltip ("Gloves" -> "armour.gloves"). */
export function categoryFor(itemClass: string | undefined, options: Array<{ id: string; text: string }>): string | undefined {
  if (!itemClass) return undefined;
  const c = itemClass.toLowerCase().replace(/s$/, "");
  const alias: Record<string, string> = { quarterstave: "quarterstaff", "body armour": "body armour", "one hand sword": "one-handed sword" };
  const want = alias[c] ?? c;
  return options.find((o) => o.id && !o.text.startsWith("Any") && o.text.toLowerCase().replace(/s$/, "") === want)?.id;
}

export interface Listing {
  id: string;
  /** Price as listed and in Divine (undefined when the currency has no poe.ninja price). */
  amount: number;
  currency: string;
  div?: number;
  seller: string;
  indexed: string;
  /** Mod lines of the listed item with their tier ("P1", "S2"), to compare with ours. */
  mods: Array<{ text: string; tier?: string; statId?: string }>;
  ilvl?: number;
  corrupted?: boolean;
}

/** PoE2 trade returns mods as objects (text, stat hash, tiers); plain strings are handled too. */
type TradeMod = string | { description?: string; hash?: string; mods?: Array<{ tier?: string }> };

const stripMarkup = (s: string) => s.replace(/\[([^|\]]+\|)?([^\]]+)\]/g, "$2");

function readMod(m: TradeMod): { text: string; tier?: string; statId?: string } {
  if (typeof m === "string") return { text: stripMarkup(m) };
  const tiers = (m.mods ?? []).map((x) => x.tier).filter(Boolean);
  return { text: stripMarkup(m.description ?? ""), tier: tiers.join("+") || undefined, statId: m.hash?.replace(/^stat\./, "") };
}

interface FetchResult {
  result?: Array<{
    id: string;
    listing?: { indexed?: string; account?: { name?: string }; price?: { amount?: number; currency?: string } };
    item?: { ilvl?: number; corrupted?: boolean; implicitMods?: TradeMod[]; explicitMods?: TradeMod[]; runeMods?: TradeMod[]; enchantMods?: TradeMod[] };
  }>;
}

/** Trade currency ids are short ("exalted", "chaos"); the static list maps them to poe.ninja names. */
export function toListings(data: FetchResult, prices: PriceTable | undefined, currencyNames: Record<string, string>): Listing[] {
  return (data.result ?? []).map((r) => {
    const amount = r.listing?.price?.amount ?? 0;
    const currency = r.listing?.price?.currency ?? "";
    const unit = prices?.divByName[currencyNames[currency] ?? ""];
    return {
      id: r.id,
      amount,
      currency,
      div: unit != null ? amount * unit : undefined,
      seller: r.listing?.account?.name ?? "",
      indexed: r.listing?.indexed ?? "",
      mods: [...(r.item?.implicitMods ?? []), ...(r.item?.runeMods ?? []), ...(r.item?.explicitMods ?? [])].map(readMod),
      ilvl: r.item?.ilvl,
      corrupted: r.item?.corrupted,
    };
  });
}

/**
 * A price to book the item at: the median of the cheapest few listings in Divine. The very cheapest
 * is often a mistake or bait, so it alone is not trusted.
 */
export function suggestedDiv(listings: Listing[]): number | undefined {
  const divs = listings
    .map((l) => l.div)
    .filter((d): d is number => d != null && d > 0)
    .sort((a, b) => a - b)
    .slice(0, 5);
  if (divs.length === 0) return undefined;
  return divs[Math.floor((divs.length - 1) / 2)];
}

/** What the price check window shows; pushed to it on every change. */
export interface PriceCheckState {
  phase: "reading" | "ready" | "searching" | "done" | "error";
  item?: ParsedItem;
  query?: PriceCheckQuery;
  listings?: Listing[];
  total?: number;
  /** Trade site page of the last search, to open in the browser. */
  url?: string;
  suggestedDiv?: number;
  waitSeconds?: number;
  error?: string;
  league?: string;
}

