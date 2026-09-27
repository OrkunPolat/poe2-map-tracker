/**
 * Turns an item tooltip into a structured item with trade stat ids, for the price checker.
 * Input is either OCR lines (GeForce Now on macOS: screenshot + Apple Vision) or the text the
 * game copies with Ctrl+Alt+C (local play). Both end up as tooltip lines top to bottom.
 */

export interface OcrLine {
  /** Vertical centre and horizontal extent, 0..1 of the captured region; y grows downwards. */
  y: number;
  x0: number;
  x1: number;
  conf: number;
  text: string;
}

/** One entry of the trade site's stat list (api/trade2/data/stats). */
export interface StatEntry {
  id: string;
  text: string;
  /** Group: explicit, implicit, rune, enchant, skill, desecrated, fractured, crafted. */
  type: string;
}

/** One entry of the trade site's item list (api/trade2/data/items). */
export interface ItemEntry {
  type: string;
  name?: string | null;
  cat: string;
}

export type ModSection = "implicit" | "explicit";

export interface ParsedMod {
  /** Tooltip line as read. */
  raw: string;
  section: ModSection;
  statId?: string;
  /** Trade stat text with # for numbers, e.g. "# to maximum Life". */
  statText?: string;
  values: number[];
  /** Roll range from advanced mod descriptions, e.g. 31-40. */
  range?: [number, number];
  /** How sure the text match is (0..1); low values are shown for the user to check. */
  score: number;
  /** A value that did not fit its range and was repaired (OCR read a stray digit). */
  corrected?: boolean;
}

export type Rarity = "unique" | "rare" | "magic" | "normal";

export interface ParsedItem {
  name?: string;
  baseType?: string;
  itemClass?: string;
  itemLevel?: number;
  rarity: Rarity;
  corrupted: boolean;
  mods: ParsedMod[];
}

// ---------- text helpers ----------

const NUM = /[+\-·•−]?\d+(?:[.,:;]\d+)?(?:\((\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)\))?/g;

/** OCR slips seen on real tooltips: C read for G, stray punctuation. */
function cleanOcr(s: string): string {
  return s
    .replace(/\bCAIN\b/gi, "GAIN")
    .replace(/\bENERCY\b/gi, "ENERGY")
    .replace(/\bSAGRED\b/gi, "SACRED")
    .replace(/\s+[-–]\s+UNSCALABLE VALUE$/i, "")
    .replace(/\bUNSCALABLE VALUE$/i, "")
    .replace(/\.(?=\s)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower-case template with every number replaced by #, plus the numbers and ranges it held. */
export function templateOf(line: string): { tmpl: string; values: number[]; ranges: Array<[number, number] | undefined>; corrected: boolean } {
  const values: number[] = [];
  const ranges: Array<[number, number] | undefined> = [];
  let corrected = false;
  const tmpl = cleanOcr(line)
    .replace(NUM, (m, lo?: string, hi?: string) => {
      const head = m.replace(/\(.*$/, "");
      const neg = /^[-−]/.test(head);
      const digits = head.replace(/^[+\-·•−]/, "").replace(/[,:;]/, ".");
      let v = Number(digits);
      let range: [number, number] | undefined;
      if (lo != null && hi != null) {
        const a = Math.min(Number(lo), Number(hi));
        const b = Math.max(Number(lo), Number(hi));
        range = [a, b];
        // "136(31-40)": OCR glued a stray digit in front; the rolled value always lies in its range.
        if ((v < a || v > b) && digits.length > 1) {
          const rest = Number(digits.slice(1));
          if (rest >= a && rest <= b) {
            v = rest;
            corrected = true;
          }
        }
      }
      values.push(neg ? -v : v);
      ranges.push(range);
      return "#";
    })
    .toLowerCase();
  return { tmpl: norm(tmpl), values, ranges, corrected };
}

/** Case, "+" before numbers and spacing do not matter when comparing to trade stat text. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\+#/g, "#")
    .replace(/[^a-z0-9#% ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

const similarity = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

// ---------- stat matcher ----------

export class StatMatcher {
  private exact = new Map<string, StatEntry[]>();
  private byWord = new Map<string, number[]>();
  private all: Array<{ n: string; e: StatEntry }> = [];

  constructor(stats: StatEntry[]) {
    for (const e of stats) {
      // Multi-line stats (a few uniques) are matched on their first line.
      const n = norm(e.text.split("\n")[0]!);
      const i = this.all.push({ n, e }) - 1;
      this.exact.set(n, [...(this.exact.get(n) ?? []), e]);
      for (const w of new Set(n.split(" "))) if (w.length > 3 && w !== "#") this.byWord.set(w, [...(this.byWord.get(w) ?? []), i]);
    }
  }

  /** Best stat for a template among the given groups, preferring the earlier group on ties. */
  match(tmpl: string, groups: string[]): { e: StatEntry; score: number } | undefined {
    const rank = (e: StatEntry) => {
      const r = groups.indexOf(e.type);
      return r < 0 ? Infinity : r;
    };
    const exact = (this.exact.get(tmpl) ?? []).filter((e) => rank(e) < Infinity).sort((a, b) => rank(a) - rank(b))[0];
    if (exact) return { e: exact, score: 1 };
    // Candidates share at least half of the line's longer words; then edit distance decides.
    const words = [...new Set(tmpl.split(" "))].filter((w) => w.length > 3 && w !== "#");
    if (words.length === 0) return undefined;
    const hits = new Map<number, number>();
    for (const w of words) for (const i of this.byWord.get(w) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1);
    let best: { e: StatEntry; score: number } | undefined;
    for (const [i, h] of hits) {
      if (h < Math.ceil(words.length / 2)) continue;
      const c = this.all[i]!;
      if (rank(c.e) === Infinity) continue;
      const score = similarity(tmpl, c.n);
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && rank(c.e) < rank(best.e))) best = { e: c.e, score };
    }
    return best;
  }
}

// ---------- tooltip parsing ----------

const HEADER = /^(.+?):\s*ITEM LEVEL\s*(\d+)/i;
const SECTION_WORDS = ["prefix", "suffix", "unique", "crafted", "desecrated", "fractured"];
/** Advanced descriptions put a PREFIX / SUFFIX / UNIQUE label left of each mod group; OCR may drop a letter. */
const isSectionLabel = (s: string) => {
  const w = s.trim().toLowerCase();
  return w.length >= 4 && w.length <= 11 && !/\s/.test(w) && SECTION_WORDS.some((k) => similarity(w, k) >= 0.7);
};
/** "Corrupted" in red is read poorly ("CORAURtEn"); a word close to it is enough. */
const isCorrupted = (s: string) => s.split(/\s+/).some((w) => w.length >= 7 && w.length <= 11 && similarity(w.toLowerCase(), "corrupted") >= 0.55);
const PROPERTY = /^[A-Z][A-Z '’]+:\s*[+\d]/i;
const IMPLICIT_GROUPS = ["implicit", "rune", "enchant", "skill"];
const EXPLICIT_GROUPS = ["explicit", "desecrated", "fractured", "crafted"];
const MIN_SCORE = 0.8;

/** Keeps the tooltip's own lines: they are centred on the item name and follow each other closely. */
function tooltipLines(lines: OcrLine[]): { head: OcrLine[]; header?: OcrLine; body: OcrLine[]; labels: OcrLine[] } {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const hi = sorted.findIndex((l) => HEADER.test(l.text));
  if (hi < 0) return { head: [], body: sorted, labels: [] };
  const header = sorted[hi]!;
  const cx = (header.x0 + header.x1) / 2;
  const centred = (l: OcrLine) => Math.abs((l.x0 + l.x1) / 2 - cx) < 0.06;
  // Name lines: up to two centred lines right above the "Class: Item Level" line (other text may sit beside them).
  const head = sorted.slice(0, hi).filter((l) => centred(l) && header.y - l.y < 0.12).slice(-2);
  const body: OcrLine[] = [];
  const labels: OcrLine[] = [];
  let last = header.y;
  const gap = head.length > 1 ? Math.abs(head[1]!.y - head[0]!.y) : 0.03;
  for (const l of sorted.slice(hi + 1)) {
    // A long vertical gap means the tooltip ended and the rest is the game world behind it.
    if (l.y - last > gap * 3.5) break;
    if (isSectionLabel(l.text) && (l.x0 + l.x1) / 2 < cx) labels.push(l);
    else if (centred(l)) body.push(l);
    else continue;
    last = l.y;
  }
  return { head, header, body, labels };
}

export function parseTooltip(lines: OcrLine[], matcher: StatMatcher, items: ItemEntry[]): ParsedItem {
  const { head, header, body, labels } = tooltipLines(lines);
  const hm = header ? HEADER.exec(cleanOcr(header.text)) : null;
  const firstLabelY = labels.length ? Math.min(...labels.map((l) => l.y)) : undefined;
  const reqY = body.find((l) => /^REQUIRES/i.test(l.text))?.y ?? -1;
  const item: ParsedItem = {
    itemClass: hm ? titleCase(hm[1]!.trim()) : undefined,
    itemLevel: hm ? Number(hm[2]) : undefined,
    rarity: "normal",
    corrupted: false,
    mods: [],
  };

  // Name and base: two lines is a rare or unique ("Sorrow Claw" / "War Wraps"), one is magic or normal.
  const names = head.map((l) => titleCase(cleanOcr(l.text)));
  const bases = items.filter((i) => !i.name);
  const bestBase = (s: string) => best(bases.map((b) => b.type), s);
  if (names.length === 2) {
    item.name = names[0];
    item.baseType = bestBase(names[1]!)?.value ?? names[1];
    const u = best(
      items.filter((i) => i.name).map((i) => i.name!),
      names[0]!,
    );
    item.rarity = u && u.score >= 0.85 ? "unique" : "rare";
    if (item.rarity === "unique") item.name = u!.value;
  } else if (names.length === 1) {
    // A magic name wraps the base in affixes ("Sharp War Bow of the Hunt"): find the base inside it.
    const inside = bases.map((b) => b.type).filter((t) => names[0]!.toLowerCase().includes(t.toLowerCase()));
    const b = inside.sort((a, c) => c.length - a.length)[0];
    item.baseType = b ?? bestBase(names[0]!)?.value ?? names[0];
    item.rarity = b && b.toLowerCase() !== names[0]!.toLowerCase() ? "magic" : "normal";
    if (item.rarity === "magic") item.name = names[0];
  }

  for (const l of body) {
    const text = cleanOcr(l.text);
    if (isCorrupted(text)) {
      item.corrupted = true;
      continue;
    }
    if (l.y <= reqY || PROPERTY.test(text) || /^REQUIRES/i.test(text) || text.length < 6) continue;
    const section: ModSection = firstLabelY != null && l.y > firstLabelY ? "explicit" : firstLabelY != null ? "implicit" : "explicit";
    const groups = firstLabelY == null ? [...EXPLICIT_GROUPS, ...IMPLICIT_GROUPS] : section === "implicit" ? IMPLICIT_GROUPS : EXPLICIT_GROUPS;
    const mod = matchLine(text, matcher, groups);
    if (mod) item.mods.push({ ...mod, raw: l.text, section: firstLabelY == null ? (IMPLICIT_GROUPS.includes(mod.group) ? "implicit" : "explicit") : section });
  }
  return item;
}

function matchLine(text: string, matcher: StatMatcher, groups: string[]): (Omit<ParsedMod, "raw" | "section"> & { group: string }) | undefined {
  const t = templateOf(text);
  let m = matcher.match(t.tmpl, groups);
  let values = t.values;
  // Trade lists "reduced"/"less" as negative "increased"/"more".
  if ((!m || m.score < 1) && /\b(reduced|less)\b/.test(t.tmpl)) {
    const flipped = t.tmpl.replace(/\breduced\b/, "increased").replace(/\bless\b/, "more");
    const f = matcher.match(flipped, groups);
    if (f && (!m || f.score > m.score)) {
      m = f;
      values = values.map((v) => -v);
    }
  }
  if (!m || m.score < MIN_SCORE) return undefined;
  const range = t.ranges.find((r) => r) ?? undefined;
  return {
    statId: m.e.id,
    statText: m.e.text,
    values,
    range,
    score: m.score,
    corrected: t.corrected || undefined,
    group: m.e.type,
  };
}

function best(options: string[], s: string): { value: string; score: number } | undefined {
  const n = norm(s);
  let out: { value: string; score: number } | undefined;
  for (const o of options) {
    const score = similarity(n, norm(o));
    if (!out || score > out.score) out = { value: o, score };
  }
  return out;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/'S\b/g, "'s");
