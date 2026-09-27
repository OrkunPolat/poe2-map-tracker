import type { PriceTable, PricePair } from "./types";

/**
 * Our own hourly price record. poe.ninja only keeps one point per day, so zooming into hours needs
 * prices we saved ourselves while the app was running. One point per hour, only for items we care about.
 */
export interface PriceLogPoint {
  /** Start of the hour (ms). */
  ts: number;
  /** Divine price of one Chaos / Exalted Orb at that hour, to express items in each pair currency. */
  chaosDiv: number;
  exDiv: number;
  /** Item name -> [Divine price, Divine traded per hour]. */
  items: Record<string, [number, number]>;
}

export interface PriceLog {
  league: string;
  points: PriceLogPoint[];
}

const HOUR = 3600 * 1000;
export const PRICE_LOG_DAYS = 14;

/** Adds (or replaces) this hour's point; keeps `days` of history. A league change starts a new log. */
export function recordPrices(log: PriceLog | undefined, prices: PriceTable, names: Iterable<string>, now: number, days = PRICE_LOG_DAYS): PriceLog {
  const chaosDiv = prices.divByName["Chaos Orb"];
  const exDiv = prices.divByName["Exalted Orb"];
  const base: PriceLog = log && log.league === prices.league ? log : { league: prices.league, points: [] };
  if (!chaosDiv || !exDiv) return base;
  const items: Record<string, [number, number]> = {};
  for (const n of names) {
    const div = prices.divByName[n];
    if (div != null) items[n] = [div, prices.volumeByName?.[n] ?? 0];
  }
  const ts = Math.floor(now / HOUR) * HOUR;
  const keep = base.points.filter((p) => p.ts !== ts && p.ts >= ts - days * 24 * HOUR);
  return { league: base.league, points: [...keep, { ts, chaosDiv, exDiv, items }].sort((a, b) => a.ts - b.ts) };
}

/** One item's hourly series in a pair currency ("divine", "exalted", "chaos"), oldest first. */
export function hourlySeries(log: PriceLog | undefined, name: string, pairId: string): PricePair["points"] {
  if (!log) return [];
  const out: PricePair["points"] = [];
  for (const p of log.points) {
    const it = p.items[name];
    if (!it) continue;
    const per = pairId === "divine" ? 1 : pairId === "chaos" ? p.chaosDiv : pairId === "exalted" ? p.exDiv : undefined;
    if (!per) continue;
    out.push({ ts: p.ts, rate: it[0] / per, volume: it[1] });
  }
  return out;
}
