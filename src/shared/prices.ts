import type { ItemHistory, PriceTable } from "./types";

const BASE = "https://poe.ninja/poe2/api/economy";
/** poe.ninja PoE2 exchange categories that realistically drop from maps. */
export const PRICE_TYPES = [
  "Currency", "Fragments", "Ritual", "Expedition", "Delirium", "Breach", "Abyss",
  "Essences", "SoulCores", "Runes", "Idols", "Verisium", "UncutGems", "LineageSupportGems",
];

/** poe.ninja categories whose items live in special stash tabs (what the stash reader looks for). */
export const STASH_CATEGORIES = [
  "Currency", "Fragments", "Ritual", "Expedition", "Delirium", "Breach", "Abyss", "Essences", "SoulCores", "Runes", "Idols", "Verisium",
];

interface ExchangeOverview {
  core?: { primary?: string };
  lines?: Array<{ id: string; primaryValue?: number; volumePrimaryValue?: number; sparkline?: { totalChange?: number; data?: number[] } }>;
  items?: Array<{ id: string; name: string; image?: string; detailsId?: string }>;
}

export async function fetchLeagues(fetchFn: typeof fetch, userAgent: string): Promise<string[]> {
  const res = await fetchFn(`${BASE}/leagues`, { headers: { "User-Agent": userAgent } });
  if (!res.ok) throw new Error(`poe.ninja leagues HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ id: string }>;
  return data.map((l) => l.id);
}

/** Maps one overview response to name -> Divine price. Values are only trusted when quoted in divine. */
export function overviewToPrices(data: ExchangeOverview): Record<string, number> {
  if (data.core?.primary && data.core.primary !== "divine") {
    throw new Error(`Unexpected poe.ninja primary currency: ${data.core.primary}`);
  }
  const nameById = new Map((data.items ?? []).map((i) => [i.id, i.name]));
  const out: Record<string, number> = {};
  for (const line of data.lines ?? []) {
    const name = nameById.get(line.id);
    if (name && typeof line.primaryValue === "number") out[name] = line.primaryValue;
  }
  return out;
}

/** Tablet mechanic -> poe.ninja category holding that mechanic's consumables. */
export const FARM_CATEGORY: Record<string, string> = {
  Ritual: "Ritual",
  Abyss: "Abyss",
  Delirium: "Delirium",
  Breach: "Breach",
  Expedition: "Expedition",
};

export async function fetchPrices(league: string, fetchFn: typeof fetch, userAgent: string): Promise<PriceTable> {
  const divByName: Record<string, number> = { "Divine Orb": 1 };
  const byCategory: Record<string, Array<{ name: string; div: number }>> = {};
  const imageByName: Record<string, string> = {};
  const changeByName: Record<string, number> = {};
  const volumeByName: Record<string, number> = {};
  const sparkByName: Record<string, number[]> = {};
  const typeByName: Record<string, string> = {};
  const detailsIdByName: Record<string, string> = {};
  const errors: string[] = [];
  await Promise.all(
    PRICE_TYPES.map(async (type) => {
      const url = `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`;
      try {
        const res = await fetchFn(url, { headers: { "User-Agent": userAgent } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ExchangeOverview;
        const prices = overviewToPrices(data);
        for (const it of data.items ?? []) {
          if (prices[it.name] == null) continue;
          if (it.image) imageByName[it.name] = `https://web.poecdn.com${it.image}`;
          typeByName[it.name] = type;
          if (it.detailsId) detailsIdByName[it.name] = it.detailsId;
        }
        const nameById = new Map((data.items ?? []).map((i) => [i.id, i.name]));
        for (const line of data.lines ?? []) {
          const n = nameById.get(line.id);
          if (!n) continue;
          if (typeof line.sparkline?.totalChange === "number") changeByName[n] = line.sparkline.totalChange;
          if (line.sparkline?.data?.length && line.sparkline.data.every((v) => typeof v === "number")) sparkByName[n] = line.sparkline.data;
          if (typeof line.volumePrimaryValue === "number") volumeByName[n] = line.volumePrimaryValue;
        }
        Object.assign(divByName, prices);
        byCategory[type] = Object.entries(prices)
          .map(([name, div]) => ({ name, div }))
          .sort((a, b) => b.div - a.div);
      } catch (e) {
        errors.push(`${type}: ${(e as Error).message}`);
      }
    }),
  );
  if (errors.length === PRICE_TYPES.length) throw new Error(`poe.ninja unreachable (${errors[0]})`);
  divByName["Divine Orb"] = 1;
  const ex = divByName["Exalted Orb"];
  return { league, fetchedAt: Date.now(), divByName, byCategory, imageByName, changeByName, volumeByName, sparkByName, typeByName, detailsIdByName, exPerDiv: ex ? 1 / ex : undefined };
}

interface DetailsResponse {
  pairs?: Array<{ id: string; history?: Array<{ timestamp: string; rate?: number; volumePrimaryValue?: number }> }>;
}

/** Daily price and volume history of one item against each currency it trades with (what poe.ninja's item page charts). */
export async function fetchItemHistory(
  league: string,
  name: string,
  prices: PriceTable,
  fetchFn: typeof fetch,
  userAgent: string,
): Promise<ItemHistory> {
  const type = prices.typeByName?.[name];
  const id = prices.detailsIdByName?.[name];
  if (!type || !id) throw new Error("Bu item için poe.ninja geçmişi yok");
  const url = `${BASE}/exchange/current/details?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
  const res = await fetchFn(url, { headers: { "User-Agent": userAgent } });
  if (!res.ok) throw new Error(`poe.ninja HTTP ${res.status}`);
  return detailsToHistory(name, (await res.json()) as DetailsResponse);
}

export function detailsToHistory(name: string, data: DetailsResponse): ItemHistory {
  const pairs = (data.pairs ?? []).map((p) => ({
    id: p.id,
    points: (p.history ?? [])
      .filter((h) => typeof h.rate === "number" && h.rate > 0)
      .map((h) => ({ ts: Date.parse(h.timestamp), rate: h.rate!, volume: h.volumePrimaryValue ?? 0 }))
      .sort((a, b) => a.ts - b.ts),
  }));
  return { name, fetchedAt: Date.now(), pairs: pairs.filter((p) => p.points.length > 0) };
}
