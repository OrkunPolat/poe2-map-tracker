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
