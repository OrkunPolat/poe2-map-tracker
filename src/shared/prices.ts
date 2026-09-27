import type { PriceTable } from "./types";

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
  items?: Array<{ id: string; name: string; image?: string }>;
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
  const errors: string[] = [];
  await Promise.all(
    PRICE_TYPES.map(async (type) => {
      const url = `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`;
      try {
        const res = await fetchFn(url, { headers: { "User-Agent": userAgent } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ExchangeOverview;
        const prices = overviewToPrices(data);
        for (const it of data.items ?? []) if (it.image && prices[it.name] != null) imageByName[it.name] = `https://web.poecdn.com${it.image}`;
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
  return { league, fetchedAt: Date.now(), divByName, byCategory, imageByName, changeByName, volumeByName, sparkByName, exPerDiv: ex ? 1 / ex : undefined };
}
