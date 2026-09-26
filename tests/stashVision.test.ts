import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { cellsFromIcon, detectItems, estimateCellSize, type IconTemplate } from "../src/shared/stashVision";

// Game art (maxroll screenshot + poe.ninja icons) is kept out of git; the test runs where it exists.
const dir = join(__dirname, "fixtures", "stash");
const has = existsSync(join(dir, "fragment.png"));
const png = (f: string) => PNG.sync.read(readFileSync(f));

describe.skipIf(!has)("stash vision on a real Fragment tab screenshot", () => {
  const img = has ? png(join(dir, "fragment.png")) : undefined!;
  const ninja = has ? (JSON.parse(readFileSync(join(dir, "ninja-Fragments.json"), "utf8")) as { items: Array<{ id: string; name: string }> }) : { items: [] };
  const templates: IconTemplate[] = has
    ? readdirSync(join(dir, "icons")).map((f) => {
        const icon = png(join(dir, "icons", f));
        const name = ninja.items.find((i) => `${i.id}.png` === f)?.name ?? f;
        return { name, icon, ...cellsFromIcon(icon) };
      })
    : [];

  it("estimates the grid cell size", () => {
    const cell = estimateCellSize(img)!;
    expect(cell).toBeGreaterThan(50);
    expect(cell).toBeLessThan(60);
  });

  it("finds the items that poe.ninja knows, without false positives", () => {
    const t0 = Date.now();
    const found = detectItems(img, templates, estimateCellSize(img)!);
    const ms = Date.now() - t0;
    const names = found.map((f) => f.name).sort();
    console.log(`${found.length} items in ${ms}ms:`, found.map((f) => `${f.name}@${f.x},${f.y} s=${f.score.toFixed(0)} m=${f.margin.toFixed(0)} r=${f.rel.toFixed(2)}`));
    // Items visible in the screenshot that are in poe.ninja's Fragments list (checked by eye).
    // Origin Spark is left out: its slot carries the gold hover highlight in this screenshot.
    for (const n of ["Ancient Crisis Fragment", "Weathered Crisis Fragment", "Faded Crisis Fragment", "Breachlord Sac", "Origin Cradle", "Simulacrum Splinter", "Simulacrum", "Kulemak's Invitation", "Call of the Shadows", "Deadly Fate", "Cowardly Fate", "Victorious Fate"]) {
      expect(names).toContain(n);
    }
    // Nothing else: the other slots hold items poe.ninja does not list and must stay unrecognised.
    expect(names).toHaveLength(12);
    expect(ms).toBeLessThan(8000);
  });
});
