// Pulls waystone modifiers from poe2db.tw and writes src/shared/data/waystoneMods.json.
// Run: node scripts/fetch-waystone-mods.mjs   (re-run after a patch that changes waystone mods)
import { writeFileSync } from "node:fs";
import { parseWaystoneMods } from "../src/shared/waystoneModsParse.mjs";

const res = await fetch("https://poe2db.tw/us/Waystones", { headers: { "User-Agent": "Mozilla/5.0 poe2-map-tracker" } });
if (!res.ok) throw new Error(`poe2db HTTP ${res.status}`);
const families = parseWaystoneMods(await res.text());
if (families.length < 20) throw new Error(`Only ${families.length} mods parsed; poe2db layout probably changed`);
writeFileSync(
  new URL("../src/shared/data/waystoneMods.json", import.meta.url),
  JSON.stringify({ source: "https://poe2db.tw/us/Waystones", fetchedAt: new Date().toISOString(), families }, null, 1) + "\n",
);
console.log(`${families.length} waystone mod families written`);
