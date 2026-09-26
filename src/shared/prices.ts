import type { PriceTable } from "./types";

const BASE = "https://poe.ninja/poe2/api/economy";
/** poe.ninja PoE2 exchange categories that realistically drop from maps. */
export const PRICE_TYPES = [
  "Currency", "Fragments", "Ritual", "Expedition", "Delirium", "Breach", "Abyss",
  "Essences", "SoulCores", "Runes", "Verisium", "UncutGems",
];

interface ExchangeOverview {
  core?: { primary?: string };
  lines?: Array<{ id: string; primaryValue?: number }>;
  items?: Array<{ id: string; name: string }>;
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

export async function fetchPrices(league: string, fetchFn: typeof fetch, userAgent: string): Promise<PriceTable> {
  const divByName: Record<string, number> = { "Divine Orb": 1 };
  const errors: string[] = [];
  await Promise.all(
    PRICE_TYPES.map(async (type) => {
      const url = `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`;
      try {
        const res = await fetchFn(url, { headers: { "User-Agent": userAgent } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        Object.assign(divByName, overviewToPrices((await res.json()) as ExchangeOverview));
      } catch (e) {
        errors.push(`${type}: ${(e as Error).message}`);
      }
    }),
  );
  if (errors.length === PRICE_TYPES.length) throw new Error(`poe.ninja unreachable (${errors[0]})`);
  divByName["Divine Orb"] = 1;
  const ex = divByName["Exalted Orb"];
  return { league, fetchedAt: Date.now(), divByName, exPerDiv: ex ? 1 / ex : undefined };
}
