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
  /** What this tablet cost to buy, in Divine. */
  costDiv?: number;
  /** Uses the tablet had when bought; its cost is spread over these. */
  totalUses?: number;
  /** Uses left before the next map. */
  usesLeft?: number;
}

export interface LootEntry {
  /** English item name as shown in-game, e.g. "Divine Orb". */
  name: string;
  qty: number;
  /** Price per unit in Divine at the moment it was recorded. */
  unitDiv?: number;
}

/** A non-currency drop valued by hand, e.g. a Mageblood at 20 div. */
export interface ValuableDrop {
  id: string;
  name: string;
  valueDiv: number;
}

/** Something spent on a map besides tablets: omens, splinters, waystone... */
export interface CostEntry {
  name: string;
  qty: number;
  /** Price per unit in Divine when it was added. */
  unitDiv: number;
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
  /** Tablet cost charged to this map (price / uses per tablet), in Divine. */
  costDiv?: number;
  /** Other consumables spent on this map. */
  costs?: CostEntry[];
  /** Optional for data saved before this field existed. */
  drops?: ValuableDrop[];
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
  /** Optional for data saved before this field existed. */
  costs?: CostEntry[];
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
  /** Consumables stay in the setup for the next map (same juice every map). */
  repeatCosts: boolean;
  /** A pause longer than this starts a new farm session. */
  sessionGapMin: number;
  /** Tablets stay in the setup after a map and count down their uses. */
  trackTabletUses: boolean;
  defaultTabletUses: number;
  captureCurrencyFromClipboard: boolean;
  alwaysOnTop: boolean;
  overlayEnabled: boolean;
  overlayHotkey: string;
  /** Last dragged position; undefined = top-right of the primary display. */
  overlayPos?: { x: number; y: number };
  overlayOpacity: number;
  stashHotkey: string;
  /** PoE account with discriminator ("Name#1234") for reading public tabs via the trade site. */
  tradeAccount: string;
}

export interface PriceTable {
  league: string;
  fetchedAt: number;
  /** Item name -> price in Divine. */
  divByName: Record<string, number>;
  /** poe.ninja category -> items sorted by price, most expensive first. */
  byCategory?: Record<string, Array<{ name: string; div: number }>>;
  /** Item name -> icon URL (poe.ninja CDN), used by the stash reader. */
  imageByName?: Record<string, string>;
  /** Exalted Orbs per Divine Orb. */
  exPerDiv?: number;
}

export interface StashItem {
  name: string;
  /** Undefined when the count could not be read; the UI asks the user. */
  qty?: number;
  /** User typed the count in. */
  edited?: boolean;
}

export interface StashTab {
  id: string;
  label: string;
  /** poe.ninja category the items mostly belong to (Ritual, Abyss...). */
  category?: string;
  capturedAt: number;
  screenshot: string;
  /** "trade": read from the public tab on the trade site; otherwise from a screenshot. */
  source?: "screen" | "trade";
  items: StashItem[];
}

export interface StashState {
  tabs: StashTab[];
  /** Total stash value over time, one point per "Yenile". */
  history: Array<{ ts: number; div: number }>;
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
  | { type: "addDrop"; runId: string; drop: ValuableDrop }
  | { type: "removeDrop"; runId: string; dropId: string }
  | { type: "finishRun"; ts: number }
  | { type: "deleteRun"; runId: string }
  | { type: "removePendingTablet"; index: number }
  | { type: "updatePendingTablet"; index: number; patch: Pick<TabletInfo, "costDiv" | "totalUses" | "usesLeft"> }
  | { type: "setPendingTabletsCost"; totalDiv: number; usesPerTablet: number }
  | { type: "clearPending" }
  | { type: "addPendingCost"; name: string; qty: number; unitDiv: number }
  | { type: "clearPendingCosts" }
  | { type: "reuseTablets"; runId: string };
