import type { Detection, Rgba } from "./stashVision";

/**
 * Cuts the stack-count corner out of a slot and turns it into black digits on white,
 * upscaled, which is what OCR reads best. The count is white/cream text top-left.
 */
export function countPatch(img: Rgba, d: Pick<Detection, "x" | "y" | "w" | "h">, cell: number, scale = 4): Rgba {
  const x0 = Math.max(0, Math.round(d.x + cell * 0.02));
  const y0 = Math.max(0, Math.round(d.y));
  const w = Math.min(img.width - x0, Math.round(cell * 0.7));
  const h = Math.min(img.height - y0, Math.round(cell * 0.34));

  // 1) Bright, nearly grey pixels: the count text (icons under it are coloured or darker).
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * img.width + x0 + x) * 4;
      const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
      if (Math.min(r, g, b) > 125 && Math.max(r, g, b) - Math.min(r, g, b) < 80) m[y * w + x] = 1;
    }

  // 2) Keep digit-shaped blobs only, chained left to right from the first one.
  const blobs = components(m, w, h).filter(
    (c) => c.h >= cell * 0.08 && c.h <= cell * 0.3 && c.w <= cell * 0.3 && c.y0 <= cell * 0.16,
  );
  blobs.sort((a, b) => a.x0 - b.x0);
  const keep = new Set<number>();
  let right = -Infinity;
  for (const c of blobs) {
    if (keep.size > 0 && c.x0 - right > cell * 0.08) break; // a gap: the rest belongs to the icon
    keep.add(c.id);
    right = Math.max(right, c.x1);
  }

  // 3) Render kept blobs as black on white, upscaled.
  const W = w * scale;
  const H = h * scale;
  const data = new Uint8Array(W * H * 4).fill(255);
  const label = labelMap(m, w, h);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const id = label[Math.floor(y / scale) * w + Math.floor(x / scale)]!;
      if (id && keep.has(id)) {
        const o = (y * W + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = 0;
      }
    }
  return { width: W, height: H, data };
}

interface Blob {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  w: number;
  h: number;
}

let lastLabels: { m: Uint8Array; labels: Int32Array } | undefined;

/** 8-connected component labels (cached for the mask just analysed). */
function labelMap(m: Uint8Array, w: number, h: number): Int32Array {
  if (lastLabels?.m === m) return lastLabels.labels;
  const labels = new Int32Array(w * h);
  let next = 1;
  const stack: number[] = [];
  for (let p = 0; p < w * h; p++) {
    if (!m[p] || labels[p]) continue;
    labels[p] = next;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % w;
      const y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (m[n] && !labels[n]) {
            labels[n] = next;
            stack.push(n);
          }
        }
    }
    next++;
  }
  lastLabels = { m, labels };
  return labels;
}

function components(m: Uint8Array, w: number, h: number): Blob[] {
  const labels = labelMap(m, w, h);
  const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const id = labels[y * w + x]!;
      if (!id) continue;
      const b = boxes.get(id);
      if (!b) boxes.set(id, { x0: x, y0: y, x1: x, y1: y });
      else {
        b.x0 = Math.min(b.x0, x);
        b.x1 = Math.max(b.x1, x);
        b.y0 = Math.min(b.y0, y);
        b.y1 = Math.max(b.y1, y);
      }
    }
  return [...boxes.entries()].map(([id, b]) => ({ id, x0: b.x0, y0: b.y0, x1: b.x1, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }));
}

/** Parses OCR output; a slot always holds at least one item. */
export function parseCount(text: string): number | undefined {
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  return n > 0 && n < 100_000 ? n : undefined;
}
