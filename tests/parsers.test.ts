import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCurrency, isTablet, isWaystone, parseItem, toTablet, toWaystone } from "../src/shared/itemParser";
import { classifyArea, parseLogLine, prettyAreaId } from "../src/shared/logParser";
import { overviewToPrices } from "../src/shared/prices";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("item parser", () => {
  it("parses a rare waystone (real text from Exiled-Exchange-2#331)", () => {
    const item = parseItem(fx("waystone-rare.txt"))!;
    expect(isWaystone(item)).toBe(true);
    const w = toWaystone(item);
    expect(w).toMatchObject({ rarity: "Rare", name: "Rugged Choice", itemLevel: 79, corrupted: true });
    expect(w.stats).toMatchObject({
      tier: 15, dropChance: 435, itemRarity: 72, gold: 63, magicMonsters: 26, rareMonsters: 28, additionalPacks: 19,
    });
    expect(w.mods).toHaveLength(14);
    expect(w.mods.some((m) => m.startsWith("Can be used"))).toBe(false);
  });

  it("parses a Ctrl+Alt+C tablet with ranges and section headers (Exiled-Exchange-2#540)", () => {
    const item = parseItem(fx("tablet-advanced.txt"))!;
    expect(isTablet(item)).toBe(true);
    expect(item.mods.map((m) => m.kind)).toEqual(["implicit", "prefix", "suffix"]);
    const t = toTablet(item);
    expect(t.type).toBe("Expedition");
    expect(t.itemLevel).toBe(77);
    expect(t.mods).toEqual([
      "17 Maps in Range contain Expedition Encounters",
      "3% increased Quantity of Items found in your Maps",
      "7% increased quantity of Artifacts dropped by Monsters in your Maps",
    ]);
  });

  it("parses a CRLF currency stack", () => {
    const item = parseItem(fx("currency-divine-crlf.txt"))!;
    expect(isCurrency(item)).toBe(true);
    expect(item.baseType).toBe("Divine Orb");
    expect(item.stackSize).toBe(3);
  });

  it("ignores non-item clipboard text", () => {
    expect(parseItem("hello world")).toBeNull();
  });

  it("detects tablet types by base name", () => {
    const mk = (base: string) => toTablet(parseItem(`Item Class: Tablet\nRarity: Normal\n${base}\n--------\nItem Level: 80`)!).type;
    expect(mk("Delirium Precursor Tablet")).toBe("Delirium");
    expect(mk("Expedition Tablet")).toBe("Expedition");
    expect(mk("Precursor Tablet")).toBe("Precursor");
  });
});

describe("log parser", () => {
  it("parses generation, entry and death lines", () => {
    const lines = fx("client-session.txt").split("\n");
    expect(parseLogLine(lines[0]!)).toBeNull();
    expect(parseLogLine(lines[3]!)).toMatchObject({ type: "areaGenerated", level: 80, areaId: "MapHiddenGrotto", seed: "555" });
    expect(parseLogLine(lines[4]!)).toMatchObject({ type: "areaEntered", name: "Hidden Grotto" });
    expect(parseLogLine(lines[5]!)).toMatchObject({ type: "slain", name: "Orkun" });
    expect((parseLogLine(lines[3]!) as { ts: number }).ts).toBe(new Date(2026, 8, 26, 20, 1, 0).getTime());
  });

  it("classifies areas", () => {
    expect(classifyArea("MapCrypt")).toBe("map");
    expect(classifyArea("HideoutFelled")).toBe("hideout");
    expect(prettyAreaId("MapHiddenGrotto")).toBe("Hidden Grotto");
  });
});

describe("prices", () => {
  it("maps poe.ninja exchange overview to divine prices", () => {
    const p = overviewToPrices({
      core: { primary: "divine" },
      lines: [{ id: "exalted", primaryValue: 0.002 }, { id: "annul", primaryValue: 0.7 }],
      items: [{ id: "exalted", name: "Exalted Orb" }, { id: "annul", name: "Orb of Annulment" }],
    });
    expect(p).toEqual({ "Exalted Orb": 0.002, "Orb of Annulment": 0.7 });
  });

  it("refuses non-divine quotes instead of silently mispricing", () => {
    expect(() => overviewToPrices({ core: { primary: "exalted" } })).toThrow();
  });
});

describe("updater version compare", () => {
  it("compares semver-ish tags", async () => {
    const { isNewerVersion } = await import("../src/shared/version");
    expect(isNewerVersion("v0.5.0", "0.4.0")).toBe(true);
    expect(isNewerVersion("0.10.0", "0.9.3")).toBe(true);
    expect(isNewerVersion("0.4.0", "0.4.0")).toBe(false);
    expect(isNewerVersion("0.3.9", "0.4.0")).toBe(false);
  });
});
it("formats long durations with hours", async () => { const { formatDuration } = await import("../src/shared/stats"); expect(formatDuration(10_926_000)).toBe("3:02:06"); expect(formatDuration(65_000)).toBe("1:05"); });

describe("trade stash", () => {
  it("groups listings by tab and sums stacks, ignoring duplicates", async () => {
    const { aggregateListings } = await import("../src/shared/tradeStash");
    const l = (id: string, tab: string, type: string, stack?: number, name?: string) => ({ id, listing: { stash: { name: tab } }, item: { typeLine: type, stackSize: stack, name } });
    const tabs = aggregateListings([
      l("1", "~price 991 divine", "Divine Orb", 10),
      l("2", "~price 991 divine", "Divine Orb", 7),
      l("2", "~price 991 divine", "Divine Orb", 7),
      l("3", "~price 992 divine", "Omen of Light", 2),
      l("4", "~price 993 divine", "Rakiata's Flow", undefined, "Rakiata's Flow"),
    ]);
    expect(tabs.get("~price 991 divine")!.get("Divine Orb")).toBe(17);
    expect(tabs.get("~price 992 divine")!.get("Omen of Light")).toBe(2);
    expect(tabs.get("~price 993 divine")!.get("Rakiata's Flow")).toBe(1);
  });

  it("rate limiter follows server rules with one request of headroom", async () => {
    const { RateLimiter } = await import("../src/shared/tradeStash");
    let t = 0;
    const rl = new RateLimiter(() => t);
    rl.update("5:10:60,15:60:300");
    for (let i = 0; i < 4; i++) {
      expect(rl.waitMs()).toBe(0);
      rl.record();
      t += 100;
    }
    expect(rl.waitMs()).toBeGreaterThan(9000); // 5th request in 10s would hit the limit
    t += 10_000;
    expect(rl.waitMs()).toBe(0);
  });
});

describe("trade tab names", () => {
  it("keeps the user's name around the price note", async () => {
    const { tabDisplayName } = await import("../src/shared/tradeStash");
    // Real tab names seen on the PoE2 trade site.
    expect(tabDisplayName("~price 991 divine Expedition")).toBe("Expedition");
    expect(tabDisplayName("~price 99 waystone-8      ritul")).toBe("ritul");
    expect(tabDisplayName("Breach~b/o 2 chaos")).toBe("Breach");
    expect(tabDisplayName("~price 1 divine")).toBeUndefined();
  });
});

describe("waystone danger", () => {
  it("matches marked poe2db mods against a copied waystone and builds a stash regex", async () => {
    const data = (await import("../src/shared/data/waystoneMods.json")).default as { families: import("../src/shared/waystoneDanger").WaystoneModFamily[] };
    const { dangerousMatches, avoidRegex } = await import("../src/shared/waystoneDanger");
    const fams = data.families;
    expect(fams.length).toBeGreaterThan(40);
    const crit = fams.find((f) => f.danger[0]!.startsWith("Monsters have #% increased Critical Hit Chance"))!;
    const maxRes = fams.find((f) => f.danger[0] === "#% maximum Player Resistances")!;
    const marked = new Set([crit.id, maxRes.id]);
    // Lines as the game prints them on a waystone.
    const hits = dangerousMatches(["Monsters have 363% increased Critical Hit Chance", "-6% maximum Player Resistances", "Monsters are Evasive"], fams, marked);
    expect(hits.map((h) => h.line)).toEqual(["Monsters have 363% increased Critical Hit Chance", "-6% maximum Player Resistances"]);
    const { regex, missing } = avoidRegex([crit, maxRes], fams);
    expect(regex.startsWith('"!')).toBe(true);
    expect(missing).toEqual([]);
    expect(regex.length).toBeLessThan(40);
    // Every fragment must appear verbatim in the text the game prints for that mod.
    const frags = regex.slice(2, -1).split("|");
    const printed = ["monsters have 363% increased critical hit chance", "-6% maximum player resistances"];
    for (const f of frags) expect(printed.some((p) => p.includes(f))).toBe(true);
    const { shortLabel } = await import("../src/shared/waystoneDanger");
    expect(shortLabel("Monsters have #% increased Critical Hit Chance")).toBe("Critical Hit Chance");
    expect(shortLabel("#% maximum Player Resistances")).toBe("maximum Player Resistances");
  });
});

describe("tab setup check", () => {
  it("flags duplicates, unnamed tabs, wrong notes and missing tabs", async () => {
    const { checkTabs } = await import("../src/shared/tabCheck");
    const issues = checkTabs(
      [
        { stashName: "~price 991 divine Expedition", price: { amount: 991, currency: "divine" }, items: 20, category: "Expedition" },
        { stashName: "~price 992 divine Ritual", price: { amount: 992, currency: "divine" }, items: 12, category: "Expedition" },
        { stashName: "~price 993 divine", price: { amount: 993, currency: "divine" }, items: 4, category: "Breach" },
        { stashName: "~price 993 divine Abyss", price: { amount: 993, currency: "divine" }, items: 5, category: "Abyss" },
      ],
      [{ stashName: "~price 994 exalted Delirium", price: { amount: 994, currency: "exalted" }, items: 3 }],
    );
    const kinds = issues.map((i) => i.kind);
    expect(issues.find((i) => i.kind === "ok" && i.tab.includes("Expedition"))).toBeTruthy();
    // A tab's contents are shown as read; its name is only a label, never an error.
    expect(issues.find((i) => i.kind === "ok" && i.tab.includes("Ritual"))).toBeTruthy();
    expect(issues.find((i) => i.kind === "duplicatePrice")).toMatchObject({ price: 993 });
    expect(kinds).toContain("noName");
    expect(issues.find((i) => i.kind === "wrongNote")).toMatchObject({ tab: "~price 994 exalted Delirium" });
    expect(issues.filter((i) => i.kind === "missing").map((i) => (i as { suggested: string }).suggested)).toContain("~price 990 divine Currency");
    // Gem tab (999) is no longer suggested nor flagged; tabs read later are not "missing".
    expect(JSON.stringify(issues)).not.toContain("999");
    const later = checkTabs([], [], new Set([998]));
    expect(later.some((i) => i.kind === "missing" && i.suggested.includes("Rune"))).toBe(false);
  });
});

describe("rate limiter shares the budget with other tools", () => {
  it("waits when the server says the IP already used the window", async () => {
    const { RateLimiter } = await import("../src/shared/tradeStash");
    let t = 0;
    const rl = new RateLimiter(() => t);
    rl.update("5:10:60,15:60:300");
    rl.syncState("4:10:0,4:60:0"); // someone else already made 4 requests
    expect(rl.waitMs()).toBeGreaterThan(9000);
    const blocked = new RateLimiter(() => t);
    blocked.update("5:10:60");
    blocked.syncState("5:10:120"); // restricted for 120 s
    expect(blocked.waitMs()).toBeGreaterThanOrEqual(120_000);
  });
});

describe("partial trade reads", () => {
  it("keeps tabs that were skipped and replaces the ones read", async () => {
    const { replaceTradeTabs } = await import("../src/shared/stash");
    const { tabPrice } = await import("../src/shared/tradeStash");
    expect(tabPrice("~price 998 divine Rune")).toBe(998);
    const t = (name: string, n: number) => ({ id: `trade:${name}`, label: name, capturedAt: 0, screenshot: "", source: "trade" as const, items: [{ name: "x", qty: n }] });
    const before = { history: [], tabs: [t("~price 991 divine Expedition", 1), t("~price 998 divine Rune", 104)] };
    const after = replaceTradeTabs(before, [t("~price 991 divine Expedition", 5)], new Set([990, 991, 992]));
    expect(after.tabs.map((x) => [x.label, x.items[0]!.qty])).toEqual([["~price 998 divine Rune", 104], ["~price 991 divine Expedition", 5]]);
    expect(replaceTradeTabs(before, [t("~price 991 divine Expedition", 5)]).tabs).toHaveLength(1); // full read: gem tab gone = no longer public
  });
});

import { steamLibraryRoots } from "../src/main/logTail";
describe("steam libraries", () => {
  it("finds game folders on other drives from libraryfolders.vdf", () => {
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
	}
	"1"
	{
		"path"		"D:\\\\Games\\\\SteamLibrary"
	}
}`;
    expect(steamLibraryRoots(vdf)).toEqual([
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2",
      "D:\\Games\\SteamLibrary\\steamapps\\common\\Path of Exile 2",
    ]);
  });
});
