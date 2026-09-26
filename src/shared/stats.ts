import type { PriceTable, Run } from "./types";

/** Uses the price recorded with the loot; falls back to today's price for items added without one. */
export function runValueDiv(run: Run, prices?: PriceTable): number {
  const loot = run.loot.reduce((sum, l) => sum + l.qty * (l.unitDiv ?? prices?.divByName[l.name] ?? 0), 0);
  return loot + dropsValueDiv(run) + (run.stashLoot?.gainDiv ?? 0);
}

export function dropsValueDiv(run: Run): number {
  return (run.drops ?? []).reduce((sum, d) => sum + d.valueDiv, 0);
}

export function unpricedLoot(run: Run, prices?: PriceTable): string[] {
  return run.loot.filter((l) => l.unitDiv == null && prices?.divByName[l.name] == null).map((l) => l.name);
}

/** "Delirium + Expedition x2", order-independent so identical setups group together. */
export function tabletSetupKey(run: Run): string {
  if (run.tablets.length === 0) return "Tabletsiz";
  const counts = new Map<string, number>();
  for (const t of run.tablets) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => (n > 1 ? `${type} x${n}` : type))
    .join(" + ");
}

export const consumablesDiv = (run: Pick<Run, "costs">) => (run.costs ?? []).reduce((s, c) => s + c.qty * c.unitDiv, 0);
/**
 * Tablet share plus consumables. When the stash diff already saw an item leave the stash, the
 * hand-entered juice line for that item is not counted a second time.
 */
export const runCostDiv = (run: Run) => {
  const seenSpent = new Set((run.stashLoot?.items ?? []).filter((i) => i.qty < 0).map((i) => i.name));
  const manual = (run.costs ?? []).filter((c) => !seenSpent.has(c.name)).reduce((s, c) => s + c.qty * c.unitDiv, 0);
  return (run.costDiv ?? 0) + manual + (run.stashLoot?.spentDiv ?? 0);
};
export const runNetDiv = (run: Run, prices?: PriceTable) => runValueDiv(run, prices) - runCostDiv(run);

/** Farm = the mechanic the tablets push; ties (2 Delirium + 2 Expedition) name both. */
export function farmKey(run: Run): string {
  if (run.tablets.length === 0) return "Tabletsiz";
  const counts = new Map<string, number>();
  for (const t of run.tablets) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return [...counts.entries()]
    .filter(([, n]) => n === max)
    .map(([type]) => type)
    .sort()
    .join(" + ");
}

export const tabletCountKey = (run: Run) => `${run.tablets.length} tablet`;

export interface GroupSummary {
  key: string;
  runs: number;
  totalDiv: number;
  avgDiv: number;
  avgCost: number;
  avgNet: number;
  /** Net Divine per hour of in-map time; undefined when no time was recorded. */
  netPerHour?: number;
  avgTimeMs: number;
  deaths: number;
  /** Sort hint for groups that have a natural order (hours, stat ranges). */
  order: number;
}

export function summarize(
  runs: Run[],
  keyOf: (r: Run) => string | undefined,
  prices?: PriceTable,
  orderOf?: (r: Run) => number,
): GroupSummary[] {
  const groups = new Map<string, Run[]>();
  for (const r of runs) {
    const k = keyOf(r);
    if (k != null) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const totalDiv = rs.reduce((a, r) => a + runValueDiv(r, prices), 0);
    const cost = rs.reduce((a, r) => a + runCostDiv(r), 0);
    const ms = rs.reduce((a, r) => a + r.mapTimeMs, 0);
    return {
      key,
      runs: rs.length,
      totalDiv,
      avgDiv: totalDiv / rs.length,
      avgCost: cost / rs.length,
      avgNet: (totalDiv - cost) / rs.length,
      netPerHour: ms > 0 ? (totalDiv - cost) / (ms / 3_600_000) : undefined,
      avgTimeMs: ms / rs.length,
      deaths: rs.reduce((a, r) => a + r.deaths, 0),
      order: orderOf ? Math.min(...rs.map(orderOf)) : 0,
    };
  });
}

export const byAvgNet = (a: GroupSummary, b: GroupSummary) => b.avgNet - a.avgNet;

/** "26.09 20:00" bucket for the clock hour a map started in. */
export const hourKey = (run: Run) => hourKeyAt(run.startedAt);

export function hourKeyAt(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm} ${String(d.getHours()).padStart(2, "0")}:00`;
}

/** Buckets a waystone header stat into fixed-width ranges, e.g. 60 with step 50 -> "50-99%". */
export function statBucket(value: number | undefined, step: number): { key: string; order: number } {
  if (value == null) return { key: "yok", order: -1 };
  const lo = Math.floor(value / step) * step;
  return { key: `${lo}-${lo + step - 1}%`, order: lo };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const CSV_HEADERS = [
  "Tarih", "Map", "Area Level", "Waystone Tier", "Waystone Rarity", "Item Rarity %", "Item Quantity %",
  "Pack Size %", "Magic Monsters %", "Rare Monsters %", "Monster Effectiveness %", "Delirious %",
  "Waystone Modlari", "Tablet Setup", "Tablet Modlari", "Sure (dk)", "Olum", "Loot", "Degerli Itemler", "Toplam (div)", "Tablet Maliyeti (div)", "Net (div)", "Not",
];

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon-separated with BOM so Excel on a Turkish-locale Windows opens it as columns. */
export function runsToCsv(runs: Run[], prices?: PriceTable): string {
  const rows = runs.map((r) => {
    const w = r.waystone?.stats ?? {};
    return [
      new Date(r.startedAt).toLocaleString("tr-TR"),
      r.areaName,
      r.areaLevel,
      w.tier,
      r.waystone?.rarity,
      w.itemRarity,
      w.itemQuantity,
      w.packSize,
      w.magicMonsters,
      w.rareMonsters,
      w.monsterEffectiveness,
      w.delirious,
      r.waystone?.mods.join(" | "),
      tabletSetupKey(r),
      r.tablets.map((t) => `${t.type}: ${t.mods.join(", ")}`).join(" | "),
      (r.mapTimeMs / 60000).toFixed(1).replace(".", ","),
      r.deaths,
      r.loot.map((l) => `${l.qty}x ${l.name}`).join(", "),
      (r.drops ?? []).map((d) => `${d.name} (${d.valueDiv} div)`).join(", "),
      runValueDiv(r, prices).toFixed(2).replace(".", ","),
      runCostDiv(r).toFixed(2).replace(".", ","),
      runNetDiv(r, prices).toFixed(2).replace(".", ","),
      r.note,
    ].map(cell).join(";");
  });
  return "\uFEFF" + [CSV_HEADERS.join(";"), ...rows].join("\r\n");
}
