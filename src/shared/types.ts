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
  /**
   * Loot measured automatically: stash read (trade site) while in this map, compared with the
   * next reading after it. Positive qty came in, negative was spent.
   */
  stashLoot?: {
    items: Array<{ name: string; qty: number; unitDiv?: number }>;
    gainDiv: number;
    spentDiv: number;
    beforeAt: number;
    afterAt: number;
    /** Item lines the user chose to leave out (e.g. a trade between two maps). */
    ignored?: string[];
  };
  /** Left out of every total and statistic (still listed in history). */
  excluded?: boolean;
  /** League the map was played in (poe.ninja league id); older runs have none. */
  league?: string;
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
  /** Price check: reads the item tooltip under the cursor (Alt / Option held works too). */
  priceCheckHotkey: string;
  /** Last dragged position; undefined = top-right of the primary display. */
  overlayPos?: { x: number; y: number };
  overlayOpacity: number;
  stashHotkey: string;
  /** PoE account with discriminator ("Name#1234") for reading public tabs via the trade site. */
  tradeAccount: string;
  /** Waystone mod family ids the user marked as dangerous for their build. */
  dangerousMods: string[];
  /** First-run setup finished or skipped. */
  onboarded: boolean;
  /** Read the stash automatically around each map to measure its loot. */
  autoStash: boolean;
  /** Seconds after entering a map before the stash is read (trade site lags behind the game). */
  autoStashDelaySec: number;
  /**
   * "local": the game runs on this PC (Client.txt, Ctrl+C). "gfn": cloud streaming such as
   * GeForce Now; maps are started and ended by hotkey, loot still comes from the stash.
   */
  playMode: "local" | "gfn";
  gfnFarm: string;
  gfnTabletCount: number;
  gfnMapName: string;
  gfnStartHotkey: string;
  /**
   * Tabs (by their 990-999 price) the automatic per-map read leaves out: big tabs that rarely
   * change while mapping cost most of the trade site's request budget. Manual refresh reads all.
   */
  autoSkipPrices?: number[];
  /** The skip list was set (by default rule or by the user); do not recompute it. */
  autoSkipConfigured?: boolean;
  /** Stash items whose unit price is below this are hidden and left out of stash totals. */
  stashMinValue?: { amount: number; unit: CurrencyUnit };
  /** A new league the user chose not to switch to (so it is not offered again). */
  dismissedLeague?: string;
  gfnEndHotkey: string;
}

export interface PriceTable {
  league: string;
  fetchedAt: number;
  /** Item name -> price in Divine. */
  divByName: Record<string, number>;
  /** poe.ninja category -> items sorted by price, most expensive first. */
  byCategory?: Record<string, Array<{ name: string; div: number }>>;
  /** Item name -> price change over the last 7 days in % (poe.ninja sparkline). */
  changeByName?: Record<string, number>;
  /** Item name -> poe.ninja exchange category and details id (for the per-item price history). */
  typeByName?: Record<string, string>;
  detailsIdByName?: Record<string, string>;
  /** Item name -> daily % change vs 7 days ago, oldest first (poe.ninja sparkline, last = today). */
  sparkByName?: Record<string, number[]>;
  /** Item name -> traded volume in Divine per hour (poe.ninja "Volume / Hour"; how liquid it is). */
  volumeByName?: Record<string, number>;
  /** Item name -> icon URL (poe.ninja CDN), used by the stash reader. */
  imageByName?: Record<string, string>;
  /** Exalted Orbs per Divine Orb. */
  exPerDiv?: number;
}

export type CurrencyUnit = "chaos" | "ex" | "div";

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
  | { type: "setStashLoot"; runId: string; stashLoot: NonNullable<Run["stashLoot"]> }
  | { type: "toggleStashLootItem"; runId: string; name: string }
  | { type: "setExcluded"; runId: string; excluded: boolean }
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

/** One currency pair of an item on the Currency Exchange: price in that currency per item, per day. */
export interface PricePair {
  /** poe.ninja pair id: "divine", "exalted" or "chaos". */
  id: string;
  /** Oldest first. `rate` is pair currency per 1 item, `volume` is Divine traded that day. */
  points: Array<{ ts: number; rate: number; volume: number }>;
}

export interface ItemHistory {
  name: string;
  fetchedAt: number;
  pairs: PricePair[];
  /** Our own hourly record per pair id (only while the app was running); empty until it has data. */
  hourly?: Record<string, PricePair["points"]>;
}
