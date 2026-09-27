import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StatMatcher, parseTooltip, templateOf, type ItemEntry, type OcrLine, type StatEntry } from "../src/shared/itemParse";

// Real GeForce Now screenshots of three items, read by native/poe2-ocr (Apple Vision), with the game world around them.
const dir = join(__dirname, "fixtures/ocr");
const stats = JSON.parse(readFileSync(join(dir, "stats.json"), "utf8")) as StatEntry[];
const items = JSON.parse(readFileSync(join(dir, "items.json"), "utf8")) as ItemEntry[];
const matcher = new StatMatcher(stats);
const load = (f: string) =>
  readFileSync(join(dir, f), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as OcrLine);
const summary = (f: string) => {
  const it = parseTooltip(load(f), matcher, items);
  return { ...it, mods: it.mods.map((m) => `${m.section[0]} ${m.statText} = ${m.values.join("/")}${m.corrected ? " (fixed)" : ""}`) };
};

describe("tooltip templates", () => {
  it("replaces numbers and keeps rolls", () => {
    expect(templateOf("+76(65-78) TO EVASION RATING")).toMatchObject({ tmpl: "# to evasion rating", values: [76], ranges: [[65, 78]] });
    expect(templateOf("136(31-40)% INCREASED PROJECTILE SPEED")).toMatchObject({ values: [36], corrected: true });
    expect(templateOf("ALLIES. IN YOUR PRESENCE REGENERATE 2:8(2-3)% OF THEIR MAXIMUM LIFE PER SECOND").values).toEqual([2.8]);
  });
});

describe("real tooltips", () => {
  it("rare gloves", () => {
    const s = summary("item1.jsonl");
    expect(s).toMatchObject({ name: "Sorrow Claw", baseType: "War Wraps", itemClass: "Gloves", itemLevel: 81, rarity: "rare", corrupted: false });
    expect(s.mods).toEqual(
      expect.arrayContaining([
        "e #% increased Projectile Speed = 36 (fixed)",
        "e # to Evasion Rating = 76",
        "e # to maximum Energy Shield = 24",
        "e #% increased Projectile Damage = 37",
        "e # to Level of all Projectile Skills = 2",
        "e #% increased Critical Damage Bonus = 28",
      ]),
    );
  });
  it("corrupted rare helmet", () => {
    const s = summary("item2.jsonl");
    expect(s).toMatchObject({ name: "Miracle Glance", baseType: "Kamasan Tiara", rarity: "rare", corrupted: true, itemLevel: 83 });
    expect(s.mods).toEqual([
      "i # to Dexterity = 12",
      "e #% increased Rarity of Items found = 19",
      "e # to maximum Energy Shield = 51",
      "e #% increased Energy Shield = 33",
      "e # to maximum Life = 37",
      "e #% increased Rarity of Items found = 18",
      "e #% to Fire Resistance = 28",
      "e #% to Fire and Chaos Resistances = 17",
    ]);
  });
  it("unique sceptre with a rune", () => {
    const s = summary("item3.jsonl");
    expect(s).toMatchObject({ name: "Sacred Flame", baseType: "Shrine Sceptre", rarity: "unique", corrupted: true });
    expect(s.mods).toEqual(
      expect.arrayContaining([
        "e Gain #% of Damage as Extra Fire Damage = 58",
        "e Allies in your Presence Gain #% of Damage as Extra Fire Damage = 21",
        "e Allies in your Presence Regenerate #% of their Maximum Life per second = 2.8",
      ]),
    );
  });
});
