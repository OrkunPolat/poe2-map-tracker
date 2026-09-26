/**
 * Finds items in a screenshot of a PoE2 special stash tab (Currency, Ritual, Fragment...).
 *
 * Special tabs place each item type in its own slot, but slot positions differ per tab and
 * resolution, so nothing here relies on a fixed layout. Instead every candidate icon (from
 * poe.ninja) is slid across the image at the tab's grid size and compared with a coarse
 * colour fingerprint; the stack count in each slot's top-left corner is read separately.
 */

export interface Rgba {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array | Uint8ClampedArray;
}

export interface IconTemplate {
  name: string;
  /** Slot size in grid cells (a 128px poe.ninja icon is 2x2). */
  cellsW: number;
  cellsH: number;
  icon: Rgba;
}

export interface Detection {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** RMS colour distance; lower is better. */
  score: number;
  /** Distance to the best *other* item; a small margin means the match is ambiguous. */
  margin: number;
  /** score relative to a flat patch of the window's mean colour; lower = more icon-like. */
  rel: number;
}

const GRID = 8; // fingerprint resolution per slot side
const SLOT_BG: [number, number, number] = [8, 8, 30]; // navy slot background behind icons

/** Summed-area tables per channel so any box average costs O(1). */
class Integral {
  readonly w: number;
  readonly h: number;
  private sums: Float64Array[];

  constructor(img: Rgba) {
    this.w = img.width;
    this.h = img.height;
    const W = this.w + 1;
    this.sums = [0, 1, 2].map(() => new Float64Array(W * (this.h + 1)));
    for (let y = 0; y < this.h; y++) {
      const row = [0, 0, 0];
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        for (let c = 0; c < 3; c++) {
          row[c]! += img.data[i + c]!;
          this.sums[c]![(y + 1) * W + x + 1] = this.sums[c]![y * W + x + 1]! + row[c]!;
        }
      }
    }
  }

  mean(c: number, x0: number, y0: number, x1: number, y1: number): number {
    const W = this.w + 1;
    const s = this.sums[c]!;
    const a = Math.max(0, Math.min(this.w, Math.round(x0)));
    const b = Math.max(0, Math.min(this.h, Math.round(y0)));
    const cc = Math.max(a + 1, Math.min(this.w, Math.round(x1)));
    const d = Math.max(b + 1, Math.min(this.h, Math.round(y1)));
    return (s[d * W + cc]! - s[b * W + cc]! - s[d * W + a]! + s[b * W + a]!) / ((cc - a) * (d - b));
  }
}

/** GRID×GRID×3 fingerprint of a box; cells covering the stack-count digits are skipped. */
function fingerprint(int: Integral, x: number, y: number, w: number, h: number, cellW: number, cellH: number): Float32Array {
  const gx = GRID * cellW;
  const gy = GRID * cellH;
  const out = new Float32Array(gx * gy * 3);
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const x0 = x + (i * w) / gx;
      const y0 = y + (j * h) / gy;
      const x1 = x + ((i + 1) * w) / gx;
      const y1 = y + ((j + 1) * h) / gy;
      for (let c = 0; c < 3; c++) out[(j * gx + i) * 3 + c] = int.mean(c, x0, y0, x1, y1);
    }
  }
  return out;
}

function digitMask(cellW: number, cellH: number): Uint8Array {
  const gx = GRID * cellW;
  const gy = GRID * cellH;
  const m = new Uint8Array(gx * gy);
  // Count text sits in the first cell's top-left ~45% x 30%.
  for (let j = 0; j < Math.ceil(GRID * 0.3); j++) for (let i = 0; i < Math.ceil(GRID * 0.45); i++) m[j * gx + i] = 1;
  return m;
}

function flatten(fp: Float32Array): Float32Array {
  const m = [0, 0, 0];
  const n = fp.length / 3;
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) m[c]! += fp[k * 3 + c]!;
  const out = new Float32Array(fp.length);
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) out[k * 3 + c] = m[c]! / n;
  return out;
}

function rms(a: Float32Array, b: Float32Array, mask: Uint8Array): number {
  let s = 0;
  let n = 0;
  for (let k = 0; k < mask.length; k++) {
    if (mask[k]) continue;
    for (let c = 0; c < 3; c++) {
      const d = a[k * 3 + c]! - b[k * 3 + c]!;
      s += d * d;
    }
    n++;
  }
  return Math.sqrt(s / (n * 3));
}

/** Icon composited on the slot background, shrunk to 90% like the game draws it, as a fingerprint. */
function templateFingerprint(t: IconTemplate, slotW: number, slotH: number): Float32Array {
  const W = Math.max(8, Math.round(slotW));
  const H = Math.max(8, Math.round(slotH));
  const data = new Uint8Array(W * H * 4);
  const scale = Math.min(W / t.icon.width, H / t.icon.height) * 0.9;
  const iw = t.icon.width * scale;
  const ih = t.icon.height * scale;
  const ox = (W - iw) / 2;
  const oy = (H - ih) / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      let [r, g, b] = SLOT_BG;
      const sx = Math.floor((x - ox) / scale);
      const sy = Math.floor((y - oy) / scale);
      if (sx >= 0 && sy >= 0 && sx < t.icon.width && sy < t.icon.height) {
        const i = (sy * t.icon.width + sx) * 4;
        const a = t.icon.data[i + 3]! / 255;
        r = r * (1 - a) + t.icon.data[i]! * a;
        g = g * (1 - a) + t.icon.data[i + 1]! * a;
        b = b * (1 - a) + t.icon.data[i + 2]! * a;
      }
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return fingerprint(new Integral({ width: W, height: H, data }), 0, 0, W, H, t.cellsW, t.cellsH);
}

/**
 * Grid cell size in pixels, from the dark bluish slot boxes that are clearly visible
 * (brown tab background is excluded). Returns undefined when no slot is found.
 */
export function estimateCellSize(img: Rgba): number | undefined {
  const { width: W, height: H, data } = img;
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const r = data[p * 4]!;
    const g = data[p * 4 + 1]!;
    const b = data[p * 4 + 2]!;
    if (b >= r - 1 && Math.max(r, g, b) < 120) mask[p] = 1;
  }
  const closed = erode(dilate(erode(dilate(mask, W, H, 1), W, H, 4), W, H, 3), W, H, 0);
  const sizes: number[] = [];
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let p = 0; p < W * H; p++) {
    if (!closed[p] || seen[p]) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    stack.push(p);
    seen[p] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W;
      const y = (q - x) / W;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const nb of [q - 1, q + 1, q - W, q + W]) {
        if (nb < 0 || nb >= W * H || seen[nb] || !closed[nb]) continue;
        if ((nb === q - 1 && x === 0) || (nb === q + 1 && x === W - 1)) continue;
        seen[nb] = 1;
        stack.push(nb);
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const minSide = Math.min(W, H) * 0.03;
    const maxSide = Math.min(W, H) * 0.12;
    // Roughly square, mostly filled boxes are single slots.
    if (w >= minSide && w <= maxSide && Math.abs(w - h) <= w * 0.15 && n / (w * h) > 0.6) sizes.push((w + h) / 2);
  }
  if (sizes.length === 0) return undefined;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

function dilate(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  if (r === 0) return m;
  return morph(m, W, H, r, 1);
}
function erode(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  if (r === 0) return m;
  return morph(m, W, H, r, 0);
}
/** Separable square min/max filter. */
function morph(m: Uint8Array, W: number, H: number, r: number, want: 0 | 1): Uint8Array {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = want ? 0 : 1;
      for (let k = -r; k <= r && v !== want; k++) {
        const xx = x + k;
        const px = xx < 0 || xx >= W ? 0 : m[y * W + xx]!;
        if (px === want) v = want;
      }
      tmp[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = want ? 0 : 1;
      for (let k = -r; k <= r && v !== want; k++) {
        const yy = y + k;
        const px = yy < 0 || yy >= H ? 0 : tmp[yy * W + x]!;
        if (px === want) v = want;
      }
      out[y * W + x] = v;
    }
  return out;
}

export interface DetectOptions {
  /** Final accept: RMS colour distance to the icon at most this... */
  maxScore?: number;
  /** ...and the next-best different item at least this much worse... */
  minMargin?: number;
  /** ...and clearly more icon-like than a flat patch (score / flat-patch distance). */
  maxRel?: number;
}

interface Shape {
  cw: number;
  ch: number;
  mask: Uint8Array;
  items: Array<{ name: string; fp: Float32Array }>;
}

/** Best and second-best (different item) distance for one window. */
function classify(int: Integral, shape: Shape, cell: number, x: number, y: number) {
  const w = cell * shape.cw;
  const h = cell * shape.ch;
  const fp = fingerprint(int, x, y, w, h, shape.cw, shape.ch);
  let best = Infinity;
  let second = Infinity;
  let name = "";
  for (const it of shape.items) {
    const d = rms(fp, it.fp, shape.mask);
    if (d < best) {
      second = best;
      best = d;
      name = it.name;
    } else if (d < second) second = d;
  }
  return { name, x, y, w, h, score: best, margin: second - best, rel: best / Math.max(1, rms(fp, flatten(fp), shape.mask)) };
}

export function detectItems(img: Rgba, templates: IconTemplate[], cell: number, opts: DetectOptions = {}): Detection[] {
  const maxScore = opts.maxScore ?? 20;
  const minMargin = opts.minMargin ?? 4;
  const maxRel = opts.maxRel ?? 0.65;
  const int = new Integral(img);
  const stride = Math.max(2, Math.round(cell / 8));

  // Group templates by slot shape so each window fingerprint is computed once per shape.
  const shapes = new Map<string, Shape>();
  for (const t of templates) {
    const key = `${t.cellsW}x${t.cellsH}`;
    if (!shapes.has(key)) shapes.set(key, { cw: t.cellsW, ch: t.cellsH, mask: digitMask(t.cellsW, t.cellsH), items: [] });
    shapes.get(key)!.items.push({ name: t.name, fp: templateFingerprint(t, cell * t.cellsW, cell * t.cellsH) });
  }

  // 1) Coarse scan: windows that look like a slot (navy corners) and resemble some icon.
  const candidates: Array<Detection & { shape: Shape }> = [];
  for (const shape of shapes.values()) {
    const w = cell * shape.cw;
    const h = cell * shape.ch;
    for (let y = 0; y + h <= img.height; y += stride) {
      for (let x = 0; x + w <= img.width; x += stride) {
        if (!slotCorners(int, x, y, w, h)) continue;
        const c = classify(int, shape, cell, x, y);
        if (c.score <= maxScore * 2 && c.rel <= 1) candidates.push({ ...c, shape });
      }
    }
  }

  // 2) One location per slot: keep the most icon-like window, drop overlapping ones.
  candidates.sort((a, b) => a.rel - b.rel);
  const kept: Array<Detection & { shape: Shape }> = [];
  for (const c of candidates) if (!kept.some((k) => overlap(k, c) > 0.3)) kept.push(c);

  // 3) Refine each location pixel by pixel, then accept only clear matches.
  const out: Detection[] = [];
  for (const k of kept) {
    let best = k as Detection;
    for (let dy = -stride; dy <= stride; dy++) {
      for (let dx = -stride; dx <= stride; dx++) {
        const x = k.x + dx;
        const y = k.y + dy;
        if (x < 0 || y < 0 || x + k.w > img.width || y + k.h > img.height) continue;
        const c = classify(int, k.shape, cell, x, y);
        if (c.score < best.score) best = c;
      }
    }
    if (best.score <= maxScore && best.margin >= minMargin && best.rel <= maxRel) out.push(best);
  }
  // A special tab has one slot per item type; if an item shows up twice keep the better match.
  const byName = new Map<string, Detection>();
  for (const d of out) if (!byName.has(d.name) || byName.get(d.name)!.score > d.score) byName.set(d.name, d);
  return [...byName.values()];
}

/**
 * Real slots show their navy background in the corners around the icon; the brown tab
 * background does not. Checks top-right, bottom-left and bottom-right (top-left holds the count).
 */
function slotCorners(int: Integral, x: number, y: number, w: number, h: number): boolean {
  const k = Math.max(2, Math.min(w, h) * 0.08);
  const inset = Math.max(1, Math.min(w, h) * 0.04);
  const corners: Array<[number, number]> = [
    [x + w - inset - k, y + inset],
    [x + inset, y + h - inset - k],
    [x + w - inset - k, y + h - inset - k],
  ];
  let navy = 0;
  for (const [cx, cy] of corners) {
    const r = int.mean(0, cx, cy, cx + k, cy + k);
    const g = int.mean(1, cx, cy, cx + k, cy + k);
    const b = int.mean(2, cx, cy, cx + k, cy + k);
    if (b >= r + 4 && b >= g + 2 && Math.max(r, g, b) < 110) navy++;
  }
  return navy >= 2;
}

function overlap(a: Detection, b: Detection): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / Math.min(a.w * a.h, b.w * b.h);
}

/** Slot size in cells from a poe.ninja icon (64px per cell at scale 1). */
export function cellsFromIcon(icon: Rgba): { cellsW: number; cellsH: number } {
  return { cellsW: Math.max(1, Math.round(icon.width / 64)), cellsH: Math.max(1, Math.round(icon.height / 64)) };
}
