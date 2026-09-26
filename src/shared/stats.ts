import type { PriceTable, Run } from "./types";

/** Uses the price recorded with the loot; falls back to today's price for items added without one. */
export function runValueDiv(run: Run, prices?: PriceTable): number {
  return run.loot.reduce((sum, l) => sum + l.qty * (l.unitDiv ?? prices?.divByName[l.name] ?? 0), 0);
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

export interface SetupSummary {
  setup: string;
  runs: number;
  totalDiv: number;
  avgDiv: number;
  /** Divine per hour of in-map time; undefined when no time was recorded. */
  divPerHour?: number;
  deaths: number;
}

export function summarizeBySetup(runs: Run[], prices?: PriceTable): SetupSummary[] {
  const groups = new Map<string, Run[]>();
  for (const r of runs) groups.set(tabletSetupKey(r), [...(groups.get(tabletSetupKey(r)) ?? []), r]);
  return [...groups.entries()]
    .map(([setup, rs]) => {
      const totalDiv = rs.reduce((s, r) => s + runValueDiv(r, prices), 0);
      const ms = rs.reduce((s, r) => s + r.mapTimeMs, 0);
      return {
        setup,
        runs: rs.length,
        totalDiv,
        avgDiv: totalDiv / rs.length,
        divPerHour: ms > 0 ? totalDiv / (ms / 3_600_000) : undefined,
        deaths: rs.reduce((s, r) => s + r.deaths, 0),
      };
    })
    .sort((a, b) => b.avgDiv - a.avgDiv);
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CSV_HEADERS = [
  "Tarih", "Map", "Area Level", "Waystone Tier", "Waystone Rarity", "Item Rarity %", "Item Quantity %",
  "Pack Size %", "Magic Monsters %", "Rare Monsters %", "Monster Effectiveness %", "Delirious %",
  "Waystone Modlari", "Tablet Setup", "Tablet Modlari", "Sure (dk)", "Olum", "Loot", "Toplam (div)", "Not",
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
      runValueDiv(r, prices).toFixed(2).replace(".", ","),
      r.note,
    ].map(cell).join(";");
  });
  return "﻿" + [CSV_HEADERS.join(";"), ...rows].join("\r\n");
}
