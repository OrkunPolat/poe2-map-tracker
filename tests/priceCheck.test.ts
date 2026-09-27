import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { categoryFor, defaultQuery, suggestedDiv, toListings, tradeQuery } from "../src/shared/priceCheck";
import type { ParsedItem } from "../src/shared/itemParse";
import type { PriceTable } from "../src/shared/types";

const dir = join(__dirname, "fixtures/ocr");
const helmet: ParsedItem = {
  name: "Miracle Glance",
  baseType: "Kamasan Tiara",
  itemClass: "Helmet",
  itemLevel: 83,
  rarity: "rare",
  corrupted: true,
  mods: [
    { raw: "", section: "explicit", statId: "explicit.stat_3917489142", values: [19], range: [16, 19], score: 1 },
    { raw: "", section: "explicit", statId: "explicit.stat_3299347043", values: [37], range: [33, 41], score: 1 },
  ],
};

describe("price check query", () => {
  it("starts with nothing selected and mins just under the roll", () => {
    const q = defaultQuery(helmet, "armour.helmet");
    expect(q.mods).toEqual([
      { statId: "explicit.stat_3917489142", enabled: false, min: 17 },
      { statId: "explicit.stat_3299347043", enabled: false, min: 33 },
    ]);
  });
  it("builds the trade body the site accepted for this helmet", () => {
    const q = defaultQuery(helmet, "armour.helmet");
    q.mods = q.mods.map((m, i) => ({ ...m, enabled: true, min: i === 0 ? 15 : 33 }));
    expect(tradeQuery(helmet, q)).toEqual({
      query: {
        status: { option: "online" },
        type: "Kamasan Tiara",
        stats: [
          {
            type: "and",
            filters: [
              { id: "explicit.stat_3917489142", disabled: false, value: { min: 15 } },
              { id: "explicit.stat_3299347043", disabled: false, value: { min: 33 } },
            ],
          },
        ],
        filters: { type_filters: { filters: { rarity: { option: "nonunique" } } } },
      },
      sort: { price: "asc" },
    });
  });
  it("searches the item class without the base", () => {
    const q = { ...defaultQuery(helmet, "armour.helmet"), useBase: false, corrupted: "no" as const };
    const body = tradeQuery(helmet, q) as { query: { type?: string; filters: Record<string, unknown> } };
    expect(body.query.type).toBeUndefined();
    expect(body.query.filters).toEqual({
      type_filters: { filters: { category: { option: "armour.helmet" }, rarity: { option: "nonunique" } } },
      misc_filters: { filters: { corrupted: { option: "false" } } },
    });
  });
  it("maps tooltip classes to trade categories", () => {
    const opts = [
      { id: "armour.gloves", text: "Gloves" },
      { id: "armour.helmet", text: "Helmet" },
      { id: "weapon.sceptre", text: "Sceptre" },
      { id: "weapon.warstaff", text: "Quarterstaff" },
      { id: "armour", text: "Any Armour" },
    ];
    expect(categoryFor("Gloves", opts)).toBe("armour.gloves");
    expect(categoryFor("Helmets", opts)).toBe("armour.helmet");
    expect(categoryFor("Quarterstaves", opts)).toBe("weapon.warstaff");
  });
});

describe("trade results", () => {
  it("reads real PoE2 listings with tiers and prices in Divine", () => {
    const data = JSON.parse(readFileSync(join(dir, "trade-fetch.json"), "utf8"));
    const names = JSON.parse(readFileSync(join(dir, "currency-names.json"), "utf8"));
    const prices = { league: "x", fetchedAt: 0, divByName: { "Exalted Orb": 0.002 } } as unknown as PriceTable;
    const l = toListings(data, prices, names);
    expect(l[0]).toMatchObject({ amount: 1, currency: "exalted", div: 0.002, ilvl: 76 });
    expect(l[0]!.mods[0]).toEqual({ text: "+60 to maximum Life", tier: "P6", statId: "explicit.stat_3299347043" });
    expect(l[0]!.mods.find((m) => m.text.includes("Rarity"))?.text).toBe("17% increased Rarity of Items found");
    // Median of the five cheapest: 1, 1, 5, 5, 5 ex.
    expect(suggestedDiv(l)).toBeCloseTo(0.01);
  });
});
