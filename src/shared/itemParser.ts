import type { ItemMod, ParsedItem, TabletInfo, WaystoneInfo, WaystoneStats } from "./types";

const SEPARATOR = /^-{4,}$/;
const PROPERTY = /^([A-Z][A-Za-z' ]{1,40}): (.+)$/;
const ADVANCED_HEADER = /^\{\s*(.+?)\s*\}$/;
const TRAILING_TAG = /\s*\((implicit|enchant|rune|crafted|fractured|desecrated|augmented)\)\s*$/i;
const RANGE = /(-?\d+(?:\.\d+)?)\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g;
const FLAGS = new Set(["Corrupted", "Unidentified", "Mirrored", "Split", "Unmodifiable"]);

/** Game copies CRLF on Windows; normalise and split into "--------" sections. */
function sections(text: string): string[][] {
  const out: string[][] = [[]];
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (SEPARATOR.test(line)) out.push([]);
    else out[out.length - 1]!.push(line);
  }
  return out.filter((s) => s.length > 0);
}

/** "17(12-18) Maps ..." -> "17 Maps ..." and drop "(implicit)"-style suffixes. */
export function cleanModText(line: string): string {
  return line.replace(RANGE, "$1").replace(TRAILING_TAG, "").trim();
}

function modKind(header: string | undefined, line: string): ItemMod["kind"] {
  const tag = TRAILING_TAG.exec(line)?.[1]?.toLowerCase();
  if (tag === "implicit" || tag === "enchant" || tag === "rune") return tag;
  if (!header) return "explicit";
  const h = header.toLowerCase();
  if (h.includes("implicit")) return "implicit";
  if (h.includes("prefix")) return "prefix";
  if (h.includes("suffix")) return "suffix";
  if (h.includes("enchant")) return "enchant";
  if (h.includes("rune")) return "rune";
  return "other";
}

export function isItemText(text: string): boolean {
  return /^\s*Item Class: /.test(text);
}

export function parseItem(text: string): ParsedItem | null {
  if (!isItemText(text)) return null;
  const secs = sections(text);
  const head = secs[0] ?? [];
  const itemClass = head[0]?.replace(/^Item Class:\s*/, "") ?? "";
  const rarity = head.find((l) => l.startsWith("Rarity: "))?.replace("Rarity: ", "") ?? "";
  const nameLines = head.filter((l) => !l.startsWith("Item Class:") && !l.startsWith("Rarity:"));
  const [first = "", second] = nameLines;
  const name = second ? first : "";
  const baseType = second ?? first;

  const properties: Record<string, string> = {};
  const mods: ItemMod[] = [];
  let corrupted = false;

  for (const sec of secs.slice(1)) {
    let header: string | undefined;
    for (const line of sec) {
      if (FLAGS.has(line)) {
        if (line === "Corrupted") corrupted = true;
        continue;
      }
      const adv = ADVANCED_HEADER.exec(line);
      if (adv) {
        header = adv[1];
        continue;
      }
      const prop = PROPERTY.exec(line);
      if (prop) {
        properties[prop[1]!] = prop[2]!;
        continue;
      }
      // Descriptions and flavour text are full sentences; modifiers never end with a period.
      if (line.endsWith(".") || line.startsWith('"')) continue;
      mods.push({ text: cleanModText(line), kind: modKind(header, line) });
    }
  }

  const itemLevel = num(properties["Item Level"]);
  const stackSize = num(properties["Stack Size"]?.split("/")[0]);
  return { itemClass, rarity, name, baseType, itemLevel, stackSize, properties, mods, corrupted, raw: text };
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(v);
  return m ? Number(m[0].replace(/,/g, "")) : undefined;
}

export function isWaystone(item: ParsedItem): boolean {
  return /waystone/i.test(item.itemClass) || /\bWaystone\b/.test(item.baseType);
}

export function isTablet(item: ParsedItem): boolean {
  return /tablet/i.test(item.itemClass) || /\bTablet\b/.test(item.baseType);
}

export function isCurrency(item: ParsedItem): boolean {
  return /currency/i.test(item.itemClass) || item.rarity === "Currency";
}

type StatKey = keyof WaystoneStats;

/** Mod-line patterns; several matching lines are summed (e.g. two rarity mods). */
const MOD_STATS: Array<[StatKey, RegExp]> = [
  ["itemRarity", /(\d+)% increased Rarity of Items found in this Area/i],
  ["itemQuantity", /(\d+)% increased Quantity of Items found in this Area/i],
  ["packSize", /(\d+)% increased (?:Monster )?Pack Size/i],
  ["magicMonsters", /(\d+)% increased (?:number of )?Magic Monsters/i],
  ["rareMonsters", /(\d+)% increased (?:number of )?Rare Monsters/i],
  ["gold", /(\d+)% increased Gold found/i],
  ["experience", /(\d+)% increased Experience gain/i],
  ["monsterEffectiveness", /(\d+)% (?:increased |more )?Monster Effectiveness/i],
  ["delirious", /(\d+)% Delirious/i],
  ["additionalPacks", /Area contains (\d+) additional packs/i],
];

/** Property-line keys (the waystone header block), matched loosely by name. */
const PROPERTY_STATS: Array<[StatKey, RegExp]> = [
  ["tier", /^Waystone Tier$/i],
  ["dropChance", /Drop Chance/i],
  ["itemRarity", /Item Rarity/i],
  ["itemQuantity", /Item Quantity/i],
  ["packSize", /Pack Size/i],
  ["magicMonsters", /Magic Monsters/i],
  ["rareMonsters", /Rare Monsters/i],
  ["monsterEffectiveness", /Effectiveness/i],
  ["gold", /Gold/i],
];

export function toWaystone(item: ParsedItem): WaystoneInfo {
  const stats: WaystoneStats = {};
  for (const [key, re] of MOD_STATS) {
    for (const mod of item.mods) {
      const m = re.exec(mod.text);
      if (m) stats[key] = (stats[key] ?? 0) + Number(m[1]);
    }
  }
  // Header properties already aggregate every source, so they win over summed mods.
  for (const [prop, value] of Object.entries(item.properties)) {
    const hit = PROPERTY_STATS.find(([, re]) => re.test(prop));
    const n = num(value);
    if (hit && n != null) stats[hit[0]] = n;
  }
  if (stats.tier == null) stats.tier = num(/\(Tier (\d+)\)/.exec(item.baseType)?.[1]);
  return {
    rarity: item.rarity,
    name: item.name,
    baseType: item.baseType,
    itemLevel: item.itemLevel,
    corrupted: item.corrupted,
    stats,
    mods: item.mods.map((m) => m.text),
    raw: item.raw,
  };
}

export function tabletType(item: ParsedItem): string {
  const m = /([A-Z][a-z]+) (?:Precursor )?Tablet/.exec(item.baseType);
  return m && m[1] !== "Precursor" ? m[1]! : "Precursor";
}

export function toTablet(item: ParsedItem): TabletInfo {
  const usesProp = Object.entries(item.properties).find(([k]) => /uses/i.test(k))?.[1];
  const usesMod = item.mods.find((m) => /(\d+) uses? remaining/i.test(m.text))?.text;
  return {
    type: tabletType(item),
    rarity: item.rarity,
    name: item.name,
    baseType: item.baseType,
    itemLevel: item.itemLevel,
    usesRemaining: num(usesProp) ?? num(usesMod),
    mods: item.mods.map((m) => m.text),
    raw: item.raw,
  };
}
