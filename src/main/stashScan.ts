import { app, desktopCapturer, nativeImage, net, screen } from "electron";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Worker } from "node:worker_threads";
import { PNG } from "pngjs";
import { createWorker, PSM, type Worker as OcrWorker } from "tesseract.js";
import { STASH_CATEGORIES } from "../shared/prices";
import { countPatch, parseCount } from "../shared/stackCount";
import type { Detection } from "../shared/stashVision";
import type { PriceTable, StashTab } from "../shared/types";
import type { ScanJob } from "./stashWorker";

const iconsDir = () => join(app.getPath("userData"), "icons");

/** Downloads (once) the poe.ninja icons of every item that can sit in a special stash tab. */
async function ensureIcons(prices: PriceTable, userAgent: string): Promise<ScanJob["icons"]> {
  mkdirSync(iconsDir(), { recursive: true });
  const wanted = STASH_CATEGORIES.flatMap((c) => prices.byCategory?.[c] ?? [])
    .map((i) => ({ name: i.name, url: prices.imageByName?.[i.name] }))
    .filter((i): i is { name: string; url: string } => !!i.url);
  const out: ScanJob["icons"] = [];
  const queue = [...wanted];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        const file = join(iconsDir(), `${createHash("sha1").update(it.url).digest("hex")}.png`);
        if (!existsSync(file)) {
          try {
            const res = await net.fetch(it.url, { headers: { "User-Agent": userAgent } });
            if (!res.ok) continue;
            writeFileSync(file, Buffer.from(await res.arrayBuffer()));
          } catch {
            continue;
          }
        }
        out.push({ name: it.name, file });
      }
    }),
  );
  return out;
}

/** The stash panel is always on the left half of the screen; the inventory (right) is ignored. */
async function captureStashArea(): Promise<{ width: number; height: number; rgba: Uint8Array; png: Buffer }> {
  // Test hook: read a saved screenshot instead of the screen.
  if (process.env.POE2T_STASH_IMAGE) {
    const img = nativeImage.createFromPath(process.env.POE2T_STASH_IMAGE);
    return toRgba(img);
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const f = display.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(display.size.width * f), height: Math.round(display.size.height * f) },
  });
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!src) throw new Error("Ekran görüntüsü alınamadı");
  const full = src.thumbnail;
  const { width, height } = full.getSize();
  return toRgba(full.crop({ x: 0, y: 0, width: Math.round(width / 2), height }));
}

function toRgba(half: Electron.NativeImage) {
  const size = half.getSize();
  // toBitmap() is BGRA on every platform Electron supports; swap to RGBA.
  const bgra = half.toBitmap();
  const rgba = new Uint8Array(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i] = bgra[i + 2]!;
    rgba[i + 1] = bgra[i + 1]!;
    rgba[i + 2] = bgra[i]!;
    rgba[i + 3] = 255;
  }
  return { width: size.width, height: size.height, rgba, png: half.toPNG() };
}

/** Worker threads cannot load scripts from inside app.asar; those files are unpacked next to it. */
const unpacked = (p: string) => p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);

let worker: Worker | undefined;
function detect(job: ScanJob): Promise<{ cell?: number; detections: Detection[] }> {
  worker ??= new Worker(unpacked(join(__dirname, "stashWorker.cjs")));
  return new Promise((resolve, reject) => {
    worker!.once("message", (m: { ok: boolean; error?: string; cell?: number; detections: Detection[] }) =>
      m.ok ? resolve(m) : reject(new Error(m.error)),
    );
    worker!.postMessage(job, [job.rgba.buffer as ArrayBuffer]);
  });
}

let ocr: Promise<OcrWorker> | undefined;
function ocrWorker(): Promise<OcrWorker> {
  ocr ??= (async () => {
    const w = await createWorker("eng", 1, {
      cachePath: join(app.getPath("userData"), "tessdata"),
      workerPath: unpacked(require.resolve("tesseract.js/src/worker-script/node/index.js")),
      errorHandler: (e: unknown) => console.error("[ocr]", e),
      ...(process.env.POE2T_OCR_DEBUG ? { logger: (m: unknown) => console.log("[ocr]", JSON.stringify(m)) } : {}),
    });
    await w.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: PSM.SINGLE_LINE });
    return w;
  })();
  return ocr;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

export interface ScanResult {
  tab: StashTab;
  cell?: number;
}

/** Screenshot -> items with counts -> a StashTab keyed by the category most items belong to. */
export async function scanStashTab(prices: PriceTable, userAgent: string, shotsDir: string): Promise<ScanResult> {
  const t0 = Date.now();
  const log = (step: string) => console.log(`[stash] ${step} +${Date.now() - t0}ms`);
  const [icons, shot] = await Promise.all([ensureIcons(prices, userAgent), captureStashArea()]);
  log(`icons=${icons.length} capture=${shot.width}x${shot.height}`);
  const ts = Date.now();
  mkdirSync(shotsDir, { recursive: true });
  const screenshot = `stash-${ts}.png`;
  writeFileSync(join(shotsDir, screenshot), shot.png);

  const img = { width: shot.width, height: shot.height, data: shot.rgba.slice() };
  const { cell, detections } = await detect({ width: shot.width, height: shot.height, rgba: shot.rgba, icons });
  log(`detect cell=${cell?.toFixed(1)} items=${detections.length}`);
  if (!cell) throw new Error("Stash sekmesi bulunamadı. Oyunda özel bir sekme (Currency, Ritual…) açıkken dene.");

  // OCR failing (e.g. no internet for the first language download) must not lose the items:
  // they are kept without counts and the UI asks for them.
  const items: StashTab["items"] = detections.map((d) => ({ name: d.name }));
  try {
    const w = await withTimeout(ocrWorker(), 60_000, "OCR başlatılamadı");
    for (const [i, d] of detections.entries()) {
      const p = countPatch(img, d, cell);
      const png = new PNG({ width: p.width, height: p.height });
      png.data = Buffer.from(p.data);
      const { data } = await withTimeout(w.recognize(PNG.sync.write(png)), 15_000, "OCR zaman aşımı");
      items[i]!.qty = parseCount(data.text);
    }
  } catch (e) {
    ocr = undefined; // retry initialising next time
    console.error("[stash] ocr failed", e);
  }

  log("ocr done");
  const categoryOf = (name: string) => STASH_CATEGORIES.find((c) => prices.byCategory?.[c]?.some((i) => i.name === name));
  const votes = new Map<string, number>();
  for (const it of items) {
    const c = categoryOf(it.name);
    if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
  }
  const category = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const tab: StashTab = {
    id: category ?? `tab-${ts}`,
    label: category ?? "Bilinmeyen sekme",
    category,
    capturedAt: ts,
    screenshot,
    items,
  };
  return { tab, cell };
}

export async function shutdownStash() {
  await worker?.terminate();
  if (ocr) await (await ocr).terminate();
}
