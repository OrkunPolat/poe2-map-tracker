export interface ItemMod {
  text: string;
  /** Section the line came from, when Ctrl+Alt+C advanced text tells us. */
  kind: "implicit" | "prefix" | "suffix" | "explicit" | "enchant" | "rune" | "other";
}

export interface ParsedItem {
  itemClass: string;
  rarity: string;
  /** Rare/unique name line; empty for normal/magic items. */
  name: string;
  baseType: string;
  itemLevel?: number;
  stackSize?: number;
  /** "Key: value" property lines (e.g. "Waystone Tier" -> "15"). */
  properties: Record<string, string>;
  mods: ItemMod[];
  corrupted: boolean;
  raw: string;
}

export interface WaystoneStats {
  tier?: number;
  dropChance?: number;
  itemRarity?: number;
  itemQuantity?: number;
  packSize?: number;
  magicMonsters?: number;
  rareMonsters?: number;
  gold?: number;
  monsterEffectiveness?: number;
  experience?: number;
  delirious?: number;
  additionalPacks?: number;
}

export interface WaystoneInfo {
  rarity: string;
  name: string;
  baseType: string;
  itemLevel?: number;
  corrupted: boolean;
  stats: WaystoneStats;
  mods: string[];
  raw: string;
}

export interface TabletInfo {
  /** Mechanic the tablet adds, e.g. "Expedition", "Delirium", "Ritual". */
  type: string;
  rarity: string;
  name: string;
  baseType: string;
  itemLevel?: number;
  usesRemaining?: number;
  mods: string[];
  raw: string;
}

export interface LootEntry {
  /** English item name as shown in-game, e.g. "Divine Orb". */
  name: string;
  qty: number;
  /** Price per unit in Divine at the moment it was recorded. */
  unitDiv?: number;
}

export interface Run {
  id: string;
  startedAt: number;
  endedAt?: number;
  areaId: string;
  areaName: string;
  areaLevel?: number;
  seed?: string;
  waystone?: WaystoneInfo;
  tablets: TabletInfo[];
  loot: LootEntry[];
  deaths: number;
  /** Time spent inside this map's instance(s), excluding hideout trips. */
  mapTimeMs: number;
  screenshots: string[];
  note: string;
}

export type LocationKind = "map" | "hideout" | "town" | "other" | "unknown";

export interface Pending {
  waystone?: WaystoneInfo;
  tablets: TabletInfo[];
  screenshots: string[];
}

export interface TrackerState {
  runs: Run[];
  pending: Pending;
  location: { kind: LocationKind; areaId: string; areaName: string; since: number };
  activeRunId?: string;
  /** Start of the currently open in-map segment of the active run. */
  segmentStart?: number;
}

export interface Settings {
  logPath: string;
  league: string;
  characterName: string;
  screenshotHotkey: string;
  favoriteCurrencies: string[];
  keepTabletsAfterRun: boolean;
  captureCurrencyFromClipboard: boolean;
  alwaysOnTop: boolean;
}

export interface PriceTable {
  league: string;
  fetchedAt: number;
  /** Item name -> price in Divine. */
  divByName: Record<string, number>;
  /** Exalted Orbs per Divine Orb. */
  exPerDiv?: number;
}

export type TrackerEvent =
  | { type: "areaGenerated"; ts: number; level: number; areaId: string; seed?: string }
  | { type: "areaEntered"; ts: number; name: string }
  | { type: "slain"; ts: number; name: string }
  | { type: "waystoneCopied"; ts: number; waystone: WaystoneInfo }
  | { type: "tabletCopied"; ts: number; tablet: TabletInfo }
  | { type: "screenshot"; ts: number; file: string }
  | { type: "addLoot"; runId: string; name: string; qty: number; unitDiv?: number }
  | { type: "setLootQty"; runId: string; name: string; qty: number }
  | { type: "setNote"; runId: string; note: string }
  | { type: "finishRun"; ts: number }
  | { type: "deleteRun"; runId: string }
  | { type: "removePendingTablet"; index: number }
  | { type: "clearPending" }
  | { type: "reuseTablets"; runId: string };
