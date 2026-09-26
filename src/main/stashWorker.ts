import { readFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";
import { PNG } from "pngjs";
import { cellsFromIcon, detectItems, estimateCellSize, type IconTemplate } from "../shared/stashVision";

/** Heavy pixel work runs here so the app windows stay responsive while a tab is read. */
export interface ScanJob {
  width: number;
  height: number;
  rgba: Uint8Array;
  icons: Array<{ name: string; file: string }>;
}

const cache = new Map<string, IconTemplate>();

parentPort!.on("message", (job: ScanJob) => {
  try {
    const templates: IconTemplate[] = [];
    for (const { name, file } of job.icons) {
      let t = cache.get(file);
      if (!t) {
        try {
          const icon = PNG.sync.read(readFileSync(file));
          t = { name, icon, ...cellsFromIcon(icon) };
          cache.set(file, t);
        } catch {
          continue; // a broken icon download should not stop the scan
        }
      }
      templates.push(t);
    }
    const img = { width: job.width, height: job.height, data: job.rgba };
    const cell = estimateCellSize(img);
    const detections = cell ? detectItems(img, templates, cell) : [];
    parentPort!.postMessage({ ok: true, cell, detections });
  } catch (e) {
    parentPort!.postMessage({ ok: false, error: (e as Error).message });
  }
});
