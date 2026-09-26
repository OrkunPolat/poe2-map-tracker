import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { createWorker, PSM } from "tesseract.js";
import { describe, expect, it } from "vitest";
import { countPatch, parseCount } from "../src/shared/stackCount";
import { cellsFromIcon, detectItems, estimateCellSize } from "../src/shared/stashVision";

const dir = join(__dirname, "fixtures", "stash");
const has = existsSync(join(dir, "fragment.png"));

describe.skipIf(!has)("stack count OCR", () => {
  it("reads the counts on the real Fragment tab", async () => {
    const png = (f: string) => PNG.sync.read(readFileSync(f));
    const img = png(join(dir, "fragment.png"));
    const ninja = JSON.parse(readFileSync(join(dir, "ninja-Fragments.json"), "utf8")) as { items: Array<{ id: string; name: string }> };
    const t = readdirSync(join(dir, "icons")).map((f) => { const icon = png(join(dir, "icons", f)); return { name: ninja.items.find((i) => `${i.id}.png` === f)?.name ?? f, icon, ...cellsFromIcon(icon) }; });
    const cell = estimateCellSize(img)!;
    const found = detectItems(img, t, cell);
    const worker = await createWorker("eng", 1, { cachePath: join(dir, ".tess") });
    await worker.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: PSM.SINGLE_LINE });
    mkdirSync(join(dir, "patches"), { recursive: true });
    const counts: Record<string, number | undefined> = {};
    for (const d of found) {
      const p = countPatch(img, d, cell);
      const out = new PNG({ width: p.width, height: p.height });
      out.data = Buffer.from(p.data);
      const buf = PNG.sync.write(out);
      writeFileSync(join(dir, "patches", `${d.name}.png`), buf);
      const { data } = await worker.recognize(buf);
      counts[d.name] = parseCount(data.text);
    }
    await worker.terminate();
    console.log(counts);
    // Read by eye from the screenshot. This sample is a small, compressed 655px image; counts in the
    // 2x2 slots are not read here (the icon touches the digit) and the UI then asks the user.
    expect(counts["Simulacrum Splinter"]).toBe(185);
    const ones = ["Ancient Crisis Fragment", "Weathered Crisis Fragment", "Faded Crisis Fragment", "Simulacrum", "Kulemak's Invitation", "Call of the Shadows", "Deadly Fate", "Cowardly Fate", "Victorious Fate"];
    for (const n of ones) expect(counts[n]).toBe(1);
    // Never a wrong number where it cannot read one.
    for (const n of ["Breachlord Sac", "Origin Cradle"]) expect([1, undefined]).toContain(counts[n]);
  }, 60_000);
});
