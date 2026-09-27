import { BrowserWindow, app, net, screen, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { StatMatcher, parseTooltip, tooltipCrop, type ItemEntry, type OcrLine, type ParsedItem, type StatEntry } from "../shared/itemParse";
import { categoryFor, defaultQuery, suggestedDiv, toListings, tradeQuery, type PriceCheckQuery, type PriceCheckState } from "../shared/priceCheck";
export type { PriceCheckState };
import type { PriceTable } from "../shared/types";
import { priceFetch, priceSearch, searchWaitSeconds } from "./tradeSync";

const run = promisify(execFile);
const DATA_URL = "https://www.pathofexile.com/api/trade2/data";
const DAY = 24 * 3600 * 1000;

interface TradeData {
  fetchedAt: number;
  stats: StatEntry[];
  items: ItemEntry[];
  currencyNames: Record<string, string>;
  categories: Array<{ id: string; text: string }>;
}

interface Deps {
  league: () => string;
  prices: () => PriceTable | undefined;
  userAgent: string;
  preload: string;
  loadRenderer: (win: BrowserWindow, hash: string) => void;
  /** Adds a valuable drop to the current (or last) map; false when there is no map to add to. */
  addToMap: (name: string, valueDiv: number) => boolean;
}

let deps: Deps;
let win: BrowserWindow | null = null;
let state: PriceCheckState = { phase: "reading" };
let trade: TradeData | undefined;
let matcher: StatMatcher | undefined;

export function initPriceCheck(d: Deps) {
  deps = d;
}

export const priceCheckState = () => state;

function push(patch: Partial<PriceCheckState>) {
  state = { ...state, ...patch };
  win?.webContents.send("pricecheck:state", state);
}

// ---------- trade lists (stats, items, currency names, categories) ----------

const dataFile = () => join(app.getPath("userData"), "trade-data.json");

async function getJson<T>(path: string): Promise<T> {
  const res = await net.fetch(`${DATA_URL}/${path}`, { headers: { "User-Agent": deps.userAgent } });
  if (!res.ok) throw new Error(`trade ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

type Groups<E> = { result: Array<{ id: string; entries: E[] }> };

/** The lists change with patches, not by the hour: refreshed once a day, the cached copy used offline. */
async function tradeData(): Promise<TradeData> {
  if (trade && Date.now() - trade.fetchedAt < DAY) return trade;
  if (!trade && existsSync(dataFile())) {
    try {
      trade = JSON.parse(readFileSync(dataFile(), "utf8")) as TradeData;
    } catch {
      trade = undefined;
    }
  }
  if (!trade || Date.now() - trade.fetchedAt > DAY) {
    try {
      const [stats, items, stat, filters] = await Promise.all([
        getJson<Groups<{ id: string; text: string }>>("stats"),
        getJson<Groups<{ type: string; name?: string }>>("items"),
        getJson<Groups<{ id: string; text: string }>>("static"),
        getJson<{ result: Array<{ id: string; filters: Array<{ id: string; option?: { options: Array<{ id: string | null; text: string }> } }> }> }>("filters"),
      ]);
      const cats = filters.result.find((g) => g.id === "type_filters")?.filters.find((f) => f.id === "category")?.option?.options ?? [];
      trade = {
        fetchedAt: Date.now(),
        stats: stats.result.flatMap((g) => g.entries.map((e) => ({ id: e.id, text: e.text, type: g.id }))),
        items: items.result.flatMap((g) => g.entries.map((e) => ({ type: e.type, name: e.name ?? null, cat: g.id }))),
        currencyNames: Object.fromEntries(stat.result.flatMap((g) => g.entries.map((e) => [e.id, e.text]))),
        categories: cats.filter((o): o is { id: string; text: string } => !!o.id),
      };
      writeFileSync(dataFile(), JSON.stringify(trade));
      matcher = undefined;
    } catch (e) {
      if (!trade) throw e;
    }
  }
  matcher ??= new StatMatcher(trade.stats);
  return trade;
}

// ---------- capture + OCR ----------

const ocrTool = () => join(__dirname, "bin", "poe2-ocr").replace("app.asar", "app.asar.unpacked");

/**
 * Screenshot of the part of the screen the tooltip can be in: the game draws it next to the cursor,
 * left or right of it, so a band around the cursor over the full height is enough and keeps OCR fast.
 */
async function captureAroundCursor(): Promise<string> {
  const p = screen.getCursorScreenPoint();
  const b = screen.getDisplayNearestPoint(p).bounds;
  const w = Math.round(b.width * 0.7);
  const x = Math.min(Math.max(b.x, p.x - Math.round(w / 2)), b.x + b.width - w);
  const file = join(tmpdir(), `poe2-pricecheck-${Date.now()}.png`);
  await run("screencapture", ["-x", "-R", `${x},${b.y},${w},${b.height}`, "-t", "png", file]);
  return file;
}

async function readTooltip(): Promise<OcrLine[]> {
  if (process.platform !== "darwin") throw new Error("Ekrandan okuma şimdilik sadece Mac'te (GeForce Now).");
  // Test hook: a saved screenshot instead of the live screen.
  const fixed = process.env.POE2T_PC_IMAGE;
  const file = fixed ?? (await captureAroundCursor());
  try {
    const ocr = async (crop?: number[]) => {
      const { stdout } = await run(ocrTool(), [file, ...(crop ?? []).map(String)], { timeout: 10_000 });
      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as OcrLine);
    };
    // Pass 1 finds the tooltip; pass 2 reads just the tooltip, where the text is large enough to read cleanly.
    const first = await ocr();
    const crop = tooltipCrop(first);
    return crop ? await ocr(crop) : first;
  } finally {
    if (!fixed) rmSync(file, { force: true });
  }
}

// ---------- window ----------

function openWindow() {
  const p = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(p).workArea;
  const width = 520;
  const height = Math.min(760, wa.height - 40);
  // Beside the cursor, on the side with more room, so the tooltip stays visible.
  const x = p.x - wa.x > wa.width / 2 ? Math.max(wa.x + 8, p.x - width - 420) : Math.min(wa.x + wa.width - width - 8, p.x + 420);
  const y = Math.max(wa.y + 8, Math.min(p.y - 120, wa.y + wa.height - height - 8));
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: "#12141a",
      title: "Fiyat kontrolü",
      webPreferences: { preload: deps.preload, contextIsolation: true, sandbox: true },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Clicking back into the game closes it, like Exiled Exchange 2.
    win.on("blur", () => win?.hide());
    win.on("closed", () => (win = null));
    // "Trade sitesinde aç" goes to the real browser, never a new Electron window.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://www.pathofexile.com/")) void shell.openExternal(url);
      return { action: "deny" };
    });
    deps.loadRenderer(win, "pricecheck");
    win.once("ready-to-show", () => win?.show());
  } else {
    win.setBounds({ x, y, width, height });
    win.show();
  }
  win.focus();
}

export function closePriceCheck() {
  win?.hide();
}

/** Hotkey: read the tooltip under the cursor and open the window with its mods. */
export async function startPriceCheck() {
  state = { phase: "reading", league: deps.league() };
  openWindow();
  push({});
  try {
    const [lines, data] = await Promise.all([readTooltip(), tradeData()]);
    const item = parseTooltip(lines, matcher!, data.items);
    if (!item.baseType && item.mods.length === 0) {
      return push({ phase: "error", error: "Item okunamadı. Fareyi item'ın üstünde tutup tekrar dene; Option (Alt) basılıyken modlar daha iyi okunur." });
    }
    const query = defaultQuery(item, categoryFor(item.itemClass, data.categories));
    push({ phase: "ready", item, query, waitSeconds: searchWaitSeconds() });
    // A unique is identified by its name alone, so it can be searched right away.
    if (item.rarity === "unique") void search(query);
  } catch (e) {
    push({ phase: "error", error: (e as Error).message });
  }
}

const cache = new Map<string, { at: number; result: Pick<PriceCheckState, "listings" | "total" | "url"> }>();

export async function search(query: PriceCheckQuery) {
  const item = state.item;
  if (!item) return;
  const league = deps.league();
  const body = tradeQuery(item, query);
  const key = JSON.stringify([league, body]);
  push({ phase: "searching", query, error: undefined });
  const hit = cache.get(key);
  // Same search again within two minutes (reopening the same item) costs no request.
  if (hit && Date.now() - hit.at < 120_000) return push({ phase: "done", ...hit.result, suggestedDiv: suggestedDiv(hit.result.listings ?? []) });
  try {
    const wait = (s: number) => push({ waitSeconds: s });
    const found = await priceSearch(league, body, deps.userAgent, wait);
    const data = found.result.length ? await priceFetch(found.result, found.id, deps.userAgent, wait) : { result: [] };
    const listings = toListings(data as Parameters<typeof toListings>[0], deps.prices(), (await tradeData()).currencyNames);
    const result = {
      listings,
      total: found.total,
      url: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}/${found.id}`,
    };
    cache.set(key, { at: Date.now(), result });
    push({ phase: "done", ...result, suggestedDiv: suggestedDiv(listings), waitSeconds: 0 });
  } catch (e) {
    push({ phase: "error", error: (e as Error).message, waitSeconds: 0 });
  }
}

export function addCheckedToMap(valueDiv: number): boolean {
  const item = state.item;
  if (!item) return false;
  return deps.addToMap(item.name ?? item.baseType ?? "Item", valueDiv);
}

/** Test hook window for screenshots. */
export const priceCheckWindow = () => win;
