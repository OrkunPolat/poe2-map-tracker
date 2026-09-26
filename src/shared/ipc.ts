import type { PriceTable, Settings, StashState, TrackerState } from "./types";
import type { WaystoneModFamily } from "./waystoneDanger";

export interface UpdateInfo {
  version: string;
  pageUrl: string;
  assetUrl?: string;
  assetName?: string;
  size?: number;
  /** portable: swap the .exe; installer: silent NSIS; manual: open the release page. */
  mode: "portable" | "installer" | "manual";
}

export interface Status {
  version: string;
  update?: UpdateInfo;
  /** 0..1 while downloading an update. */
  updateProgress?: number;
  updateError?: string;
  updateCheckedAt?: number;
  logPath?: string;
  logFound: boolean;
  lastLogLineAt?: number;
  priceError?: string;
  hotkeyRegistered: boolean;
  overlayHotkeyRegistered: boolean;
  stashHotkeyRegistered: boolean;
  /** Set while a stash tab is being read. */
  stashBusy?: boolean;
  stashMessage?: { at: number; ok: boolean; text: string };
  /** Automatic stash reading for the current map: when it is due, or when it happened. */
  autoStash?: { runId: string; dueAt?: number; beforeAt?: number; beforeDiv?: number };
  /** Result of the last public-tab setup check. */
  tabCheck?: { at: number; full: boolean; issues: import("./tabCheck").TabIssue[] };
  leagues: string[];
}

export interface DebugInfo {
  /** Last log lines the tracker recognised. */
  recentLog: string[];
  lastClipboard?: { at: number; kind: string; text: string };
}

export interface Snapshot {
  state: TrackerState;
  settings: Settings;
  prices?: PriceTable;
  stash: StashState;
  waystoneMods: { source: string; fetchedAt: string; families: WaystoneModFamily[] };
  status: Status;
  debug: DebugInfo;
  now: number;
}

/** Events the UI may send; the main process adds timestamps and prices. */
export type UiEvent =
  | { type: "addLoot"; runId: string; name: string; qty: number }
  | { type: "setLootQty"; runId: string; name: string; qty: number }
  | { type: "setNote"; runId: string; note: string }
  | { type: "addDrop"; runId: string; name: string; valueDiv: number }
  | { type: "removeDrop"; runId: string; dropId: string }
  | { type: "finishRun" }
  | { type: "deleteRun"; runId: string }
  | { type: "removePendingTablet"; index: number }
  | { type: "updatePendingTablet"; index: number; patch: { costDiv?: number; totalUses?: number; usesLeft?: number } }
  | { type: "setPendingTabletsCost"; totalDiv: number; usesPerTablet: number }
  | { type: "clearPending" }
  | { type: "addPendingCost"; name: string; qty: number; unitDiv?: number }
  | { type: "clearPendingCosts" }
  | { type: "reuseTablets"; runId: string };

export interface Api {
  getSnapshot(): Promise<Snapshot>;
  onSnapshot(cb: (s: Snapshot) => void): () => void;
  dispatch(ev: UiEvent): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<void>;
  pickLogFile(): Promise<void>;
  exportCsv(): Promise<string | undefined>;
  refreshPrices(): Promise<void>;
  openDataFolder(): Promise<void>;
  checkUpdate(): Promise<void>;
  stashRefresh(): Promise<void>;
  stashSetQty(tabId: string, name: string, qty: number | undefined): Promise<void>;
  stashDeleteTab(tabId: string): Promise<void>;
  updateWaystoneMods(): Promise<string>;
  checkTabSetup(): Promise<void>;
  /** Screenshot of a region of the main window (CSS pixels) to a PNG file or the clipboard. */
  captureRect(rect: { x: number; y: number; width: number; height: number }, mode: "save" | "copy"): Promise<string>;
  copyText(text: string): void;
  installUpdate(): Promise<void>;
  resizeOverlay(height: number): void;
  showMain(): void;
  /** Lets the overlay take keyboard focus while a text field is open. */
  setOverlayFocus(focus: boolean): void;
}
