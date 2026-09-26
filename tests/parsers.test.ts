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
