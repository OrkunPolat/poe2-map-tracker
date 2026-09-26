import {
  BrowserWindow, app, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, net, protocol, screen, shell,
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
import type { Settings, TrackerEvent } from "../shared/types";
import { LogTail, detectLogPath, readTailLines } from "./logTail";
import { Store } from "./store";

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
const status: Snapshot["status"] = { logFound: false, hotkeyRegistered: false, overlayHotkeyRegistered: false, leagues: [] };
const debug: Snapshot["debug"] = { recentLog: [] };
const shotsDir = () => join(app.getPath("userData"), "screenshots");

function snapshot(): Snapshot {
  const { state, settings, prices } = store.data;
  return { state, settings, prices, status, debug, now: Date.now() };
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
  store.data.state = reduce(store.data.state, ev, {
    keepTabletsAfterRun: settings.keepTabletsAfterRun,
    characterName: settings.characterName.trim() || undefined,
  });
  store.save();
  push();
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
  return store.data.prices?.divByName[name];
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

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const { settings } = store.data;
  status.hotkeyRegistered = tryRegister(settings.screenshotHotkey, () => void takeScreenshot().catch(console.error));
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
    if (patch.screenshotHotkey !== undefined || patch.overlayHotkey !== undefined) registerHotkeys();
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
  ipcMain.handle("folder:data", () => shell.openPath(app.getPath("userData")));
  ipcMain.on("overlay:resize", (_, height: number) => {
    if (!overlay || !Number.isFinite(height)) return;
    overlay.setContentSize(OVERLAY_WIDTH, Math.min(600, Math.max(60, Math.ceil(height))));
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
    height: 860,
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
  else void win.loadFile(join(__dirname, "renderer", "index.html"));

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
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  store?.flush();
});
app.on("window-all-closed", () => app.quit());
