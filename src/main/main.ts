import {
  BrowserWindow, ClipboardItem, app, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, net, protocol, screen, shell,
} from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Snapshot, UiEvent } from "../shared/ipc";
import { isCurrency, isTablet, isWaystone, parseItem, toTablet, toWaystone } from "../shared/itemParser";
import { classifyArea, parseLogLine, prettyAreaId } from "../shared/logParser";
import { fetchLeagues, fetchPrices } from "../shared/prices";
import { runsToCsv } from "../shared/stats";
import { reduce } from "../shared/tracker";
import type { Settings, TrackerEvent, TrackerState } from "../shared/types";
import { LogTail, detectLogPath, readTailLines } from "./logTail";
import { Store } from "./store";
import { checkForUpdate, installUpdate } from "./updater";
import { scanStashTab, shutdownStash } from "./stashScan";
import { otherPublicTabs, syncTradeTabs } from "./tradeSync";
import { gfnTablets } from "../shared/gfn";
import { checkTabs } from "../shared/tabCheck";
import bundledWaystoneMods from "../shared/data/waystoneMods.json";
import { parseWaystoneMods } from "../shared/waystoneModsParse.mjs";
import type { WaystoneModFamily } from "../shared/waystoneDanger";
import { emptyStash, replaceTradeTabs, setItemQty, stashValueDiv, upsertTab } from "../shared/stash";
import { diffQty, stashLootTotals, stashLootWarnings, stashQty, toStashLoot, type Qty } from "../shared/stashDiff";
import type { PriceTable } from "../shared/types";

// Test hooks: POE2T_DATA isolates the data dir, POE2T_LOG forces a log file, POE2T_SMOKE writes a screenshot and quits.
if (process.env.POE2T_DATA) app.setPath("userData", resolve(process.env.POE2T_DATA));

const USER_AGENT = `poe2-map-tracker/${app.getVersion()} (personal tool)`;
const PRICE_REFRESH_MS = 30 * 60 * 1000;

protocol.registerSchemesAsPrivileged([{ scheme: "shot", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
const OVERLAY_WIDTH = 300;
let store: Store;
let tail: LogTail | undefined;
const status: Snapshot["status"] = { version: app.getVersion(), logFound: false, hotkeyRegistered: false, overlayHotkeyRegistered: false, stashHotkeyRegistered: false, leagues: [] };
const debug: Snapshot["debug"] = { recentLog: [] };
const shotsDir = () => join(app.getPath("userData"), "screenshots");

/** poe.ninja prices with the user's own prices for items poe.ninja does not list laid on top. */
function effPrices(): PriceTable | undefined {
  const custom = store.data.customPrices ?? {};
  const p = store.data.prices;
  if (!p && Object.keys(custom).length === 0) return undefined;
  return p ? { ...p, divByName: { ...p.divByName, ...custom } } : { league: store.data.settings.league, fetchedAt: 0, divByName: { ...custom } };
}

function snapshot(): Snapshot {
  const { state, settings } = store.data;
  const prices = effPrices();
  const bundled = bundledWaystoneMods as { source: string; fetchedAt: string; families: WaystoneModFamily[] };
  const waystoneMods = store.data.waystoneMods ? { source: bundled.source, ...store.data.waystoneMods } : bundled;
  return {
    state, settings, prices, stash: store.data.stash ?? emptyStash(), customPrices: store.data.customPrices ?? {},
    waystoneMods, status, debug, now: Date.now(),
  };
}

let pushTimer: NodeJS.Timeout | undefined;
function push() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    const snap = snapshot();
    win?.webContents.send("snapshot", snap);
    overlay?.webContents.send("snapshot", snap);
  }, 50);
}

function apply(ev: TrackerEvent) {
  const { settings } = store.data;
  const prev = store.data.state;
  store.data.state = reduce(store.data.state, ev, {
    trackTabletUses: settings.trackTabletUses,
    repeatCosts: settings.repeatCosts,
    defaultTabletUses: settings.defaultTabletUses,
    characterName: settings.characterName.trim() || undefined,
    league: settings.league || undefined,
  });
  store.save();
  push();
  autoStashOnEvent(prev, ev);
}

// ---------- Client.txt ----------
function startLog() {
  tail?.stop();
  tail = undefined;
  const { settings } = store.data;
  const path = process.env.POE2T_LOG ?? (settings.logPath || detectLogPath());
  status.logPath = path;
  status.logFound = false;
  if (!path) return push();
  try {
    // Learn where the player currently is without replaying old runs.
    const lastArea = readTailLines(path)
      .map((l) => parseLogLine(l))
      .filter((e) => e?.type === "areaGenerated")
      .pop();
    const { state } = store.data;
    if (lastArea && lastArea.type === "areaGenerated" && lastArea.ts > state.location.since && !state.activeRunId) {
      store.data.state = {
        ...state,
        location: { kind: classifyArea(lastArea.areaId), areaId: lastArea.areaId, areaName: prettyAreaId(lastArea.areaId), since: lastArea.ts },
      };
    }
    tail = new LogTail(path, onLogLine);
    tail.start();
    status.logFound = true;
  } catch (e) {
    console.error("log tail failed", e);
  }
  push();
}

function onLogLine(line: string) {
  const ev = parseLogLine(line);
  if (!ev) return;
  status.lastLogLineAt = Date.now();
  debug.recentLog = [...debug.recentLog.slice(-29), line];
  apply(ev);
}

// ---------- Clipboard (in-game Ctrl+C / Ctrl+Alt+C item text) ----------
let lastClip = "";
let clipBusy = false;
async function pollClipboard() {
  if (clipBusy) return;
  clipBusy = true;
  try {
    const text = await clipboard.readText();
    if (text !== lastClip) {
      lastClip = text;
      onClipboard(text);
    }
  } catch {
    // Clipboard can be briefly locked by another app on Windows; try again next tick.
  } finally {
    clipBusy = false;
  }
}

function onClipboard(text: string) {
  const item = parseItem(text);
  if (!item) return;
  const ts = Date.now();
  let kind = "ignored";
  if (isWaystone(item)) {
    kind = "waystone";
    apply({ type: "waystoneCopied", ts, waystone: toWaystone(item) });
  } else if (isTablet(item)) {
    kind = "tablet";
    apply({ type: "tabletCopied", ts, tablet: toTablet(item) });
  } else if (isCurrency(item) && store.data.settings.captureCurrencyFromClipboard) {
    const { state } = store.data;
    const runId = state.activeRunId ?? state.runs[state.runs.length - 1]?.id;
    if (runId) {
      kind = "loot";
      apply({ type: "addLoot", runId, name: item.baseType, qty: item.stackSize ?? 1, unitDiv: priceOf(item.baseType) });
    }
  }
  debug.lastClipboard = { at: ts, kind, text };
  push();
}

// ---------- Prices ----------
function priceOf(name: string): number | undefined {
  return effPrices()?.divByName[name];
}

async function refreshPrices() {
  try {
    status.leagues = await fetchLeagues(net.fetch as typeof fetch, USER_AGENT);
    const { settings } = store.data;
    if (!settings.league || !status.leagues.includes(settings.league)) {
      // poe.ninja lists the current challenge league first.
      settings.league = status.leagues[0] ?? settings.league;
    }
    store.data.prices = await fetchPrices(settings.league, net.fetch as typeof fetch, USER_AGENT);
    status.priceError = undefined;
    store.save();
  } catch (e) {
    status.priceError = (e as Error).message;
  }
  push();
}

// ---------- Stash ----------
async function readStashTab() {
  if (status.stashBusy) return;
  const prices = store.data.prices;
  if (!prices?.byCategory) {
    status.stashMessage = { at: Date.now(), ok: false, text: "Önce fiyatlar yüklenmeli (poe.ninja)." };
    return push();
  }
  status.stashBusy = true;
  push();
  try {
    const { tab } = await scanStashTab(prices, USER_AGENT, shotsDir());
    store.data.stash = upsertTab(store.data.stash ?? emptyStash(), tab);
    store.save();
    const unread = tab.items.filter((i) => i.qty == null).length;
    status.stashMessage = {
      at: Date.now(),
      ok: tab.items.length > 0,
      text: tab.items.length
        ? `${tab.label}: ${tab.items.length} item okundu${unread ? `, ${unread} sayı okunamadı` : ""}.`
        : "Sekmede tanınan item bulunamadı.",
    };
  } catch (e) {
    status.stashMessage = { at: Date.now(), ok: false, text: (e as Error).message };
  }
  status.stashBusy = false;
  push();
}

/**
 * Pulls public tabs from the trade site (when an account is set), re-prices every saved tab
 * and records the total for the history chart.
 */
/** Reads the public tabs once; concurrent callers share the same request. Returns whether it worked. */
let syncing: Promise<boolean> | undefined;
function syncTradeOnce(fullCheck = false, auto = false): Promise<boolean> {
  syncing ??= doSyncTrade(fullCheck, auto).finally(() => (syncing = undefined));
  return syncing;
}

async function doSyncTrade(fullCheck: boolean, auto: boolean): Promise<boolean> {
  const account = store.data.settings.tradeAccount.trim();
  if (!account) return false;
  let ok = false;
  {
    status.stashBusy = true;
    if (auto) status.stashMessage = { at: Date.now(), ok: true, text: "Otomatik stash okuması…" };
    push();
    try {
      const { tabs, truncated, seen } = await syncTradeTabs(store.data.settings.league, account, store.data.prices, USER_AGENT, (text) => {
        status.stashMessage = { at: Date.now(), ok: true, text };
        push();
      });
      let others: typeof seen = [];
      if (fullCheck) {
        status.stashMessage = { at: Date.now(), ok: true, text: "Diğer public sekmeler kontrol ediliyor…" };
        push();
        others = await otherPublicTabs(store.data.settings.league, account, new Set(seen.map((t) => t.stashName)), USER_AGENT);
      }
      status.tabCheck = { at: Date.now(), full: fullCheck, issues: checkTabs(seen, others) };
      store.data.stash = replaceTradeTabs(store.data.stash ?? emptyStash(), tabs);
      const items = tabs.reduce((s, t) => s + t.items.length, 0);
      status.stashMessage = {
        at: Date.now(),
        ok: tabs.length > 0 && !truncated,
        text: tabs.length
          ? `Trade: ${tabs.length} public sekme, ${items} item okundu.${truncated ? " Bir sekmede 100'den fazla item var, fazlası okunamadı; o sekmeyi ikiye böl." : ""}`
          : "Trade sitesinde bu hesapta ~price 990-999 divine fiyatlı public sekme bulunamadı. Kurulum adımlarına bak; trade sitesi değişiklikleri birkaç dakika gecikmeyle görür.",
      };
      ok = tabs.length > 0;
    } catch (e) {
      status.stashMessage = { at: Date.now(), ok: false, text: (e as Error).message };
    }
    status.stashBusy = false;
  }
  store.save();
  push();
  return ok;
}

async function refreshStash(fullCheck = false) {
  await refreshPrices();
  const ok = await syncTradeOnce(fullCheck);
  // A manual refresh in the hideout also closes the map that was just finished.
  if (ok) closeLastRun(stashQty(store.data.stash?.tabs ?? []));
  const stash = store.data.stash ?? emptyStash();
  if (stash.tabs.length) {
    store.data.stash = { ...stash, history: [...stash.history, { ts: Date.now(), div: stashValueDiv(stash, effPrices()) }].slice(-500) };
    store.save();
  }
  push();
}

// ---------- Automatic loot from stash readings ----------
// Each map gets a "before" reading taken while inside it (the stash cannot change in a map, and
// waiting a bit lets the trade site catch up with what was stashed just before). The next reading
// after the map ends (entering the next map, or idling in the hideout) closes it: the difference
// is that map's loot and what it used up.
const HIDEOUT_IDLE_MS = Number(process.env.POE2T_IDLE_MS) || 4 * 60 * 1000;
let beforeTimer: NodeJS.Timeout | undefined;
let idleTimer: NodeJS.Timeout | undefined;

const autoEnabled = () => store.data.settings.autoStash && !!store.data.settings.tradeAccount.trim();

function autoStashOnEvent(prev: TrackerState, ev: TrackerEvent) {
  if (ev.type !== "areaGenerated" || !autoEnabled()) return;
  const now = store.data.state;
  const snaps = (store.data.stashSnaps ??= {});
  if (now.location.kind === "map") {
    clearTimeout(idleTimer);
    const id = now.activeRunId;
    if (id && id !== prev.activeRunId) {
      clearTimeout(beforeTimer);
      const delay = store.data.settings.autoStashDelaySec * 1000;
      beforeTimer = setTimeout(() => void takeBefore(id), delay);
      status.autoStash = { runId: id, dueAt: Date.now() + delay };
      push();
    }
    return;
  }
  if (prev.location.kind === "map" && prev.activeRunId) {
    // Left the map before the delayed reading: read now, before anything gets stashed.
    const id = prev.activeRunId;
    if (!snaps[id]) {
      clearTimeout(beforeTimer);
      void takeBefore(id);
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void idleClose(), HIDEOUT_IDLE_MS);
  }
}

async function readStashQty(): Promise<Qty | undefined> {
  await refreshPrices();
  return (await syncTradeOnce(false, true)) ? stashQty(store.data.stash?.tabs ?? []) : undefined;
}

async function takeBefore(runId: string) {
  const qty = await readStashQty();
  if (!qty) return;
  const snaps = (store.data.stashSnaps ??= {});
  snaps[runId] = { ts: Date.now(), qty };
  const priceOfQty = (q: Qty) => Object.entries(q).reduce((s, [n, c]) => s + c * (priceOf(n) ?? 0), 0);
  status.autoStash = { runId, beforeAt: Date.now(), beforeDiv: priceOfQty(qty) };
  // Keep the last 40 readings; older runs are either closed or never will be.
  const keep = new Set(store.data.state.runs.slice(-40).map((r) => r.id));
  for (const k of Object.keys(snaps)) if (!keep.has(k)) delete snaps[k];
  const runs = store.data.state.runs;
  const i = runs.findIndex((r) => r.id === runId);
  const prevRun = i > 0 ? runs[i - 1] : undefined;
  const gap = store.data.settings.sessionGapMin * 60_000;
  if (prevRun && !prevRun.stashLoot && snaps[prevRun.id] && runs[i]!.startedAt - (prevRun.endedAt ?? prevRun.startedAt) <= gap) {
    closeRun(prevRun.id, snaps[prevRun.id]!, qty);
  }
  store.save();
}

async function idleClose() {
  if (store.data.state.location.kind === "map") return;
  const qty = await readStashQty();
  if (qty) closeLastRun(qty);
}

function closeLastRun(qty: Qty) {
  const { state } = store.data;
  const last = state.runs[state.runs.length - 1];
  const before = last && store.data.stashSnaps?.[last.id];
  if (!last || !before || last.stashLoot || state.location.kind === "map") return;
  closeRun(last.id, before, qty);
}

function closeRun(runId: string, before: { ts: number; qty: Qty }, after: Qty) {
  const prices = effPrices();
  const loot = toStashLoot(diffQty(before.qty, after), prices, before.ts, Date.now());
  apply({ type: "setStashLoot", runId, stashLoot: loot });
  const run = store.data.state.runs.find((r) => r.id === runId)!;
  // Typical automatic gain of the other maps, to recognise a sale or purchase landing in this one.
  const gains = store.data.state.runs
    .filter((r) => r.stashLoot && r.id !== runId)
    .map((r) => stashLootTotals(r, prices).gainDiv)
    .sort((a, b) => a - b);
  const median = gains.length ? gains[Math.floor(gains.length / 2)]! : 0;
  const { gainDiv, spentDiv } = stashLootTotals(run, prices);
  const warnings = stashLootWarnings(run, prices, median);
  status.lastClosed = { runId, areaName: run.areaName, gainDiv, spentDiv, warnings, at: Date.now() };
  status.stashMessage = {
    at: Date.now(),
    ok: warnings.length === 0,
    text: `${run.areaName}: stash farkı +${gainDiv.toFixed(2)} div${spentDiv ? `, harcanan ${spentDiv.toFixed(2)} div` : ""}${warnings.length ? ` · şüpheli: ${warnings.join(", ")}` : ""}.`,
  };
  push();
}

// ---------- Updates ----------
async function checkUpdate() {
  try {
    status.update = await checkForUpdate(USER_AGENT);
    status.updateError = undefined;
  } catch (e) {
    status.updateError = (e as Error).message;
  }
  status.updateCheckedAt = Date.now();
  push();
}

async function runUpdate() {
  if (!status.update || status.updateProgress != null) return;
  status.updateProgress = 0;
  status.updateError = undefined;
  push();
  try {
    store.flush(); // data must be on disk before the app is replaced
    await installUpdate(status.update, USER_AGENT, (p) => {
      status.updateProgress = p;
      push();
    });
  } catch (e) {
    status.updateError = (e as Error).message;
  }
  status.updateProgress = undefined;
  push();
}

// ---------- Screenshot hotkey ----------
async function takeScreenshot() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = display.size;
  const f = display.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(width * f), height: Math.round(height * f) },
  });
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!src) return;
  mkdirSync(shotsDir(), { recursive: true });
  const file = `shot-${Date.now()}.png`;
  writeFileSync(join(shotsDir(), file), src.thumbnail.toPNG());
  apply({ type: "screenshot", ts: Date.now(), file });
}

function tryRegister(accelerator: string, fn: () => void): boolean {
  if (!accelerator.trim()) return false;
  try {
    return globalShortcut.register(accelerator.trim(), fn);
  } catch {
    return false; // invalid accelerator string
  }
}

// ---------- GeForce Now mode ----------
// The game runs in the cloud, so there is no Client.txt: a hotkey stands in for the log's
// "map generated" / "hideout" lines and everything downstream (timer, stash diff) is unchanged.
function gfnStart() {
  const s = store.data.settings;
  store.data.state = { ...store.data.state, pending: { ...store.data.state.pending, tablets: gfnTablets(s.gfnFarm, s.gfnTabletCount) } };
  const ts = Date.now();
  apply({ type: "areaGenerated", ts, level: 0, areaId: "MapGFN", seed: String(ts) });
  apply({ type: "areaEntered", ts, name: s.gfnMapName.trim() || `${s.gfnFarm} map` });
}

function gfnEnd() {
  if (store.data.state.location.kind !== "map") return;
  apply({ type: "areaGenerated", ts: Date.now(), level: 0, areaId: "HideoutGFN", seed: "0" });
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const { settings } = store.data;
  if (settings.playMode === "gfn") {
    status.gfnHotkeysRegistered = tryRegister(settings.gfnStartHotkey, gfnStart) && tryRegister(settings.gfnEndHotkey, gfnEnd);
  } else status.gfnHotkeysRegistered = undefined;
  status.hotkeyRegistered = tryRegister(settings.screenshotHotkey, () => void takeScreenshot().catch(console.error));
  status.stashHotkeyRegistered = tryRegister(settings.stashHotkey, () => void readStashTab());
  status.overlayHotkeyRegistered = tryRegister(settings.overlayHotkey, () => {
    store.data.settings.overlayEnabled = !store.data.settings.overlayEnabled;
    store.save();
    syncOverlay();
    push();
  });
}

// ---------- Overlay ----------
function defaultOverlayPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - OVERLAY_WIDTH - 16, y: wa.y + 16 };
}

/** Keep a saved position only if it is still on some display (monitor setups change). */
function overlayPos() {
  const saved = store.data.settings.overlayPos;
  if (saved) {
    const onScreen = screen.getAllDisplays().some(
      (d) => saved.x >= d.bounds.x && saved.x < d.bounds.x + d.bounds.width && saved.y >= d.bounds.y && saved.y < d.bounds.y + d.bounds.height,
    );
    if (onScreen) return saved;
  }
  return defaultOverlayPos();
}

function createOverlay() {
  const { x, y } = overlayPos();
  overlay = new BrowserWindow({
    x, y,
    width: OVERLAY_WIDTH,
    height: 150,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // Clicking the overlay must not pull keyboard focus away from the game.
    focusable: false,
    show: false,
    title: "PoE2 Map Tracker Overlay",
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setOpacity(store.data.settings.overlayOpacity);
  overlay.on("moved", () => {
    if (!overlay) return;
    const [ox, oy] = overlay.getPosition();
    store.data.settings.overlayPos = { x: ox!, y: oy! };
    store.save();
  });
  overlay.on("closed", () => (overlay = null));
  overlay.once("ready-to-show", () => overlay?.showInactive());
  const devUrl = process.env.VITE_DEV_URL;
  if (devUrl) void overlay.loadURL(`${devUrl}#overlay`);
  else void overlay.loadFile(join(__dirname, "renderer", "index.html"), { hash: "overlay" });
}

function syncOverlay() {
  const { overlayEnabled, overlayOpacity } = store.data.settings;
  if (overlayEnabled && !overlay) createOverlay();
  else if (!overlayEnabled && overlay) overlay.close();
  overlay?.setOpacity(overlayOpacity);
}

// ---------- IPC ----------
function handleUi(ev: UiEvent) {
  switch (ev.type) {
    case "addLoot":
      return apply({ ...ev, unitDiv: priceOf(ev.name) });
    case "finishRun":
      return apply({ type: "finishRun", ts: Date.now() });
    case "addPendingCost": {
      const unitDiv = ev.unitDiv ?? priceOf(ev.name);
      if (unitDiv == null || !Number.isFinite(unitDiv)) return;
      return apply({ type: "addPendingCost", name: ev.name, qty: ev.qty, unitDiv });
    }
    case "addDrop": {
      const name = ev.name.trim();
      if (!name || !Number.isFinite(ev.valueDiv) || ev.valueDiv < 0) return;
      return apply({ type: "addDrop", runId: ev.runId, drop: { id: `d${Date.now().toString(36)}`, name, valueDiv: ev.valueDiv } });
    }
    default:
      return apply(ev);
  }
}

function setupIpc() {
  ipcMain.handle("snapshot:get", () => snapshot());
  ipcMain.handle("dispatch", (_, ev: UiEvent) => handleUi(ev));
  ipcMain.handle("settings:set", (_, patch: Partial<Settings>) => {
    const prev = store.data.settings;
    store.data.settings = { ...prev, ...patch };
    store.save();
    if (patch.logPath !== undefined && patch.logPath !== prev.logPath) startLog();
    if (
      patch.screenshotHotkey !== undefined || patch.overlayHotkey !== undefined || patch.stashHotkey !== undefined ||
      patch.playMode !== undefined || patch.gfnStartHotkey !== undefined || patch.gfnEndHotkey !== undefined
    )
      registerHotkeys();
    if (patch.overlayEnabled !== undefined || patch.overlayOpacity !== undefined) syncOverlay();
    if ("overlayPos" in patch && !patch.overlayPos) overlay?.setPosition(defaultOverlayPos().x, defaultOverlayPos().y);
    if (patch.alwaysOnTop !== undefined) win?.setAlwaysOnTop(patch.alwaysOnTop, "screen-saver");
    if (patch.league !== undefined && patch.league !== prev.league) void refreshPrices();
    push();
  });
  ipcMain.handle("log:pick", async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: "Path of Exile 2 Client.txt",
      filters: [{ name: "Client log", extensions: ["txt"] }],
      properties: ["openFile"],
    });
    const file = res.filePaths[0];
    if (!res.canceled && file) {
      store.data.settings.logPath = file;
      store.save();
      startLog();
    }
  });
  ipcMain.handle("export:csv", async () => {
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: `poe2-maps-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (res.canceled || !res.filePath) return undefined;
    writeFileSync(res.filePath, runsToCsv(store.data.state.runs, store.data.prices), "utf8");
    return res.filePath;
  });
  ipcMain.handle("prices:refresh", () => refreshPrices());
  ipcMain.handle("update:check", () => checkUpdate());
  ipcMain.handle("stash:refresh", () => refreshStash());
  ipcMain.handle("stash:checkSetup", () => refreshStash(true));
  ipcMain.handle("gfn:start", () => gfnStart());
  ipcMain.handle("gfn:end", () => gfnEnd());
  ipcMain.handle("price:custom", (_, name: string, div: number | undefined) => {
    const custom = (store.data.customPrices ??= {});
    if (div == null || !Number.isFinite(div) || div < 0) delete custom[name];
    else custom[name] = div;
    store.save();
    push();
  });
  ipcMain.handle("waystoneMods:update", async () => {
    const res = await net.fetch("https://poe2db.tw/us/Waystones", { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`poe2db HTTP ${res.status}`);
    const families = parseWaystoneMods(await res.text());
    // A layout change on poe2db would parse to almost nothing; keep the old list then.
    if (families.length < 20) throw new Error("poe2db sayfası beklenen formatta değil, liste güncellenmedi.");
    store.data.waystoneMods = { fetchedAt: new Date().toISOString(), families };
    store.save();
    push();
    return `${families.length} mod güncellendi`;
  });
  ipcMain.on("clipboard:write", (_, text: string) => void clipboard.writeText(text));
  ipcMain.handle("capture:rect", async (_, rect: { x: number; y: number; width: number; height: number }, mode: "save" | "copy") => {
    if (!win) return "";
    const img = await win.webContents.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    if (mode === "copy") {
      await clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(img.toPNG())], { type: "image/png" }) })]);
      return "Panoya kopyalandı";
    }
    const res = await dialog.showSaveDialog(win, {
      defaultPath: `poe2-oturum-${new Date().toISOString().slice(0, 10)}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (res.canceled || !res.filePath) return "";
    writeFileSync(res.filePath, img.toPNG());
    return `Kaydedildi: ${res.filePath}`;
  });
  ipcMain.handle("stash:setQty", (_, tabId: string, name: string, qty: number | undefined) => {
    store.data.stash = setItemQty(store.data.stash ?? emptyStash(), tabId, name, qty);
    store.save();
    push();
  });
  ipcMain.handle("stash:deleteTab", (_, tabId: string) => {
    const s = store.data.stash ?? emptyStash();
    store.data.stash = { ...s, tabs: s.tabs.filter((t) => t.id !== tabId) };
    store.save();
    push();
  });
  ipcMain.handle("update:install", () => runUpdate());
  ipcMain.handle("folder:data", () => shell.openPath(app.getPath("userData")));
  ipcMain.on("overlay:resize", (_, height: number) => {
    if (!overlay || !Number.isFinite(height)) return;
    overlay.setContentSize(OVERLAY_WIDTH, Math.min(600, Math.max(60, Math.ceil(height))));
  });
  ipcMain.on("overlay:focus", (_, focus: boolean) => {
    if (!overlay) return;
    overlay.setFocusable(focus);
    if (focus) overlay.focus();
    // Blurring hands focus back to the window underneath, normally the game.
    else overlay.blur();
  });
  ipcMain.on("main:show", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: Number(process.env.POE2T_SMOKE_HEIGHT ?? 860),
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#12100e",
    title: "PoE2 Map Tracker",
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(store.data.settings.alwaysOnTop, "screen-saver");
  // The overlay has no taskbar entry, so closing the main window quits the whole app.
  win.on("closed", () => {
    win = null;
    app.quit();
  });
  const devUrl = process.env.VITE_DEV_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, "renderer", "index.html"), process.env.POE2T_HASH ? { hash: process.env.POE2T_HASH } : process.env.POE2T_TAB ? { hash: `tab=${process.env.POE2T_TAB}` } : {});

  const smokeOut = process.env.POE2T_SMOKE;
  if (smokeOut) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const img = await win!.webContents.capturePage();
        writeFileSync(smokeOut, img.toPNG());
        if (overlay) {
          writeFileSync(smokeOut.replace(/\.png$/, "-overlay.png"), (await overlay.webContents.capturePage()).toPNG());
          writeFileSync(smokeOut.replace(/\.png$/, "-overlay.json"), JSON.stringify({ bounds: overlay.getBounds(), workArea: screen.getPrimaryDisplay().workArea }));
        }
        app.quit();
      }, Number(process.env.POE2T_SMOKE_DELAY ?? 2500));
    });
  }
}

app.whenReady().then(() => {
  store = new Store(app.getPath("userData"));
  protocol.handle("shot", (req) => {
    // shot://img/<file> -> screenshots/<file>, refusing anything that escapes the folder.
    const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ""));
    const file = resolve(shotsDir(), name);
    if (!file.startsWith(resolve(shotsDir()) + sep)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  setupIpc();
  createWindow();
  syncOverlay();
  startLog();
  registerHotkeys();
  // Do not import whatever was on the clipboard before launch.
  void clipboard
    .readText()
    .catch(() => "")
    .then((t) => {
      lastClip = t;
      setInterval(() => void pollClipboard(), 300);
    });
  void refreshPrices();
  setInterval(() => void refreshPrices(), PRICE_REFRESH_MS);
  void checkUpdate();
  if (process.env.POE2T_STASH_IMAGE) setTimeout(() => void readStashTab(), 3000);
  // Test hook: simulate two GeForce Now maps (start/end presses) to exercise the hotkey path.
  if (process.env.POE2T_GFN_TEST) {
    console.log("[gfn] hotkeys registered:", status.gfnHotkeysRegistered);
    const at = (sec: number, fn: () => void) => setTimeout(fn, sec * 1000);
    at(3, gfnStart);
    at(16, gfnEnd);
    at(20, gfnStart);
    at(33, gfnEnd);
  }
  if (process.env.POE2T_TRADE_TEST)
    setTimeout(async () => {
      await refreshStash(process.env.POE2T_TRADE_TEST === "full");
      console.log("[tabcheck]", JSON.stringify(status.tabCheck?.issues));
    }, 4000);
  setInterval(() => void checkUpdate(), 6 * 60 * 60 * 1000);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void shutdownStash();
  store?.flush();
});
app.on("window-all-closed", () => app.quit());
