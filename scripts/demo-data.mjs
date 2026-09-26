// Writes realistic demo data for UI previews: node scripts/demo-data.mjs <dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/demo-data.mjs <dir>");
mkdirSync(dir, { recursive: true });

const P = { "Divine Orb": 1, "Exalted Orb": 0.002, "Chaos Orb": 0.128, "Orb of Annulment": 0.73, "Greater Chaos Orb": 0.387, "Perfect Chaos Orb": 6.8, "Perfect Exalted Orb": 3.09 };
const tablet = (type, mods) => ({ type, rarity: "Magic", name: "", baseType: `${type} Precursor Tablet`, itemLevel: 80, mods, raw: type + Math.random() });
const exp = () => tablet("Expedition", ["17 Maps in Range contain Expedition Encounters", "5% increased Quantity of Items found in your Maps"]);
const deli = () => tablet("Delirium", ["10 Maps in Range are Delirious", "20% increased Delirium Fog duration"]);
const breach = () => tablet("Breach", ["10 Maps in Range contain Breaches", "Breaches have 20% increased Monster density"]);
const ritual = () => tablet("Ritual", ["12 Maps in Range contain Ritual Altars", "Rerolling Favours costs 20% less Tribute"]);
const waystone = (tier, rar, pack, eff) => ({
  rarity: "Rare", name: "Rugged Choice", baseType: `Waystone (Tier ${tier})`, itemLevel: 81, corrupted: true,
  stats: { tier, itemRarity: rar, packSize: pack, monsterEffectiveness: eff, magicMonsters: 26, rareMonsters: 28, dropChance: 250 },
  mods: ["Monsters have 180% increased Critical Hit Chance", `${rar}% increased Rarity of Items found in this Area`, `${pack}% increased Pack Size`, "26% increased Magic Monsters", "28% increased number of Rare Monsters", "+50% Monster Elemental Resistances", "Monsters have 200% increased Shock Chance"],
  raw: "",
});
const loot = (o) => Object.entries(o).map(([name, qty]) => ({ name, qty, unitDiv: P[name] }));

const now = Date.now();
const maps = ["Hidden Grotto", "Crypt", "Sandspit", "Burial Bog", "Savannah", "Mire", "Vaal Factory", "Steppe", "Lost Towers", "Alpine Ridge", "Channel", "Oasis", "Vaal City", "Castaway"];
const priced = (ts, total) => ts.map((t) => ({ ...t, costDiv: total / ts.length, totalUses: 10, usesLeft: 6 }));
const setups = [
  () => priced([exp(), exp(), exp(), exp()], 28),
  () => priced([exp(), exp(), exp()], 20),
  () => priced([breach(), breach(), breach(), breach()], 16),
  () => priced([breach(), breach(), deli()], 12),
];
const runs = maps.map((m, i) => {
  const start = now - (maps.length - i) * 13 * 60_000;
  const s = i % setups.length;
  return {
    id: `demo${i}`, startedAt: start, endedAt: start + 9 * 60_000, areaId: `Map${m.replace(/ /g, "")}`, areaName: m,
    areaLevel: 80 + (i % 3), seed: String(1000 + i), waystone: waystone(15 + (i % 2), 60 + i * 7, 20 + i * 3, i % 2 ? 30 : undefined),
    tablets: setups[s](),
    costDiv: [2.8, 2.0, 1.6, 1.2][s],
    loot: loot([{ "Divine Orb": 3, "Chaos Orb": 8, "Orb of Annulment": 1 }, { "Divine Orb": 2, "Exalted Orb": 140, "Greater Chaos Orb": 2 }, { "Divine Orb": 5, "Perfect Exalted Orb": 1, "Chaos Orb": 10 }, { "Divine Orb": 1, "Orb of Annulment": 2 }][s]),
    drops: i === 2 ? [{ id: "dd1", name: "Headhunter", valueDiv: 18 }] : i === 6 ? [{ id: "dd2", name: "Spectre (base)", valueDiv: 0.5 }] : [],
    deaths: i === 4 ? 1 : 0, mapTimeMs: (6 + (i % 4)) * 60_000 + i * 7_000, screenshots: [], note: "",
  };
});
// Last run is the one currently being played.
const active = runs[runs.length - 1];
active.loot = loot({ "Divine Orb": 2, "Orb of Annulment": 1 });
active.drops = [{ id: "dd3", name: "Mageblood", valueDiv: 20 }];

const state = {
  runs,
  pending: { costs: [{ name: "Omen of Light", qty: 1, unitDiv: 7.5 }, { name: "Breachstone", qty: 1, unitDiv: 2.86 }], waystone: waystone(16, 88, 35, 40), tablets: priced([exp(), exp(), exp()], 20).map((t) => ({ ...t, usesLeft: 7 })), screenshots: [] },
  location: { kind: "map", areaId: active.areaId, areaName: active.areaName, since: now - 4 * 60_000 },
  activeRunId: active.id,
  segmentStart: now - 4 * 60_000,
};
// Yesterday's evening too, so the day timeline has more than one day.
const yesterday = runs.slice(0, 6).map((r, i) => ({ ...r, id: `y${i}`, startedAt: r.startedAt - 86_400_000 - 3 * 3_600_000, endedAt: (r.endedAt ?? 0) - 86_400_000 - 3 * 3_600_000 }));
state.runs = [...yesterday, ...runs];

const mods = JSON.parse(readFileSync(new URL("../src/shared/data/waystoneMods.json", import.meta.url), "utf8")).families;
const dangerousMods = mods.filter((f) => /Critical Hit Chance|maximum Player Resistances|Monster Elemental Resistances/.test(f.danger[0])).map((f) => f.id);
const tab = (name, items) => ({ id: `trade:${name}`, label: name.replace(/~price \d+ divine /, ""), source: "trade", capturedAt: now - 600_000, screenshot: "", items: items.map(([n, q]) => ({ name: n, qty: q })) });
const stash = {
  history: [{ ts: now - 86_400_000, div: 212.4 }, { ts: now - 3_600_000, div: 238.9 }],
  tabs: [
    tab("~price 990 divine Currency", [["Divine Orb", 64], ["Exalted Orb", 1830], ["Orb of Annulment", 22], ["Chaos Orb", 140], ["Perfect Chaos Orb", 3]]),
    tab("~price 992 divine Ritual", [["Omen of Light", 6], ["Omen of Chance", 2], ["Omen of Whittling", 3], ["Omen of the Hunt", 9]]),
    tab("~price 991 divine Expedition", [["Perfect Flux", 2], ["Uhtred's Saga", 11], ["Verisium", 4200]]),
    tab("~price 994 divine Abyss", [["Kurgal's Gaze", 1], ["Preserved Cranium", 2], ["Ancient Jawbone", 4]]),
  ],
};
writeFileSync(join(dir, "tracker-data.json"), JSON.stringify({ version: 1, state, stash, settings: { overlayPos: undefined, dangerousMods, onboarded: !process.env.DEMO_WIZARD, tradeAccount: "Orkun#1234" } }));
console.log(`demo data -> ${dir}`);
