import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { it } from "vitest";
import { cellsFromIcon, detectItems, estimateCellSize } from "../src/shared/stashVision";
const dir = join(__dirname, "fixtures", "stash");
it.skipIf(!existsSync(join(dir, "fragment.png")) || !process.env.STASH_DEBUG)("debug", () => {
  const png = (f: string) => PNG.sync.read(readFileSync(f));
  const img = png(join(dir, "fragment.png"));
  const ninja = JSON.parse(readFileSync(join(dir, "ninja-Fragments.json"), "utf8")) as { items: Array<{ id: string; name: string }> };
  const t = readdirSync(join(dir, "icons")).map((f) => { const icon = png(join(dir, "icons", f)); return { name: ninja.items.find((i) => `${i.id}.png` === f)?.name ?? f, icon, ...cellsFromIcon(icon) }; });
  const found = detectItems(img, t, estimateCellSize(img)!, { minMargin: 0, maxScore: 40 });
  console.log(found.sort((a, b) => a.y - b.y || a.x - b.x).map((f) => `${f.name.padEnd(28)} ${f.x},${f.y} ${f.w}x${f.h} s=${f.score.toFixed(0)} m=${f.margin.toFixed(0)} r=${f.rel.toFixed(2)}`).join("\n"));
});
