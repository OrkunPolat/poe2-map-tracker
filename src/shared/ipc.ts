import type { PriceTable, Settings, TrackerState } from "./types";

export interface Status {
  logPath?: string;
  logFound: boolean;
  lastLogLineAt?: number;
  priceError?: string;
  hotkeyRegistered: boolean;
  overlayHotkeyRegistered: boolean;
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
  resizeOverlay(height: number): void;
  showMain(): void;
  /** Lets the overlay take keyboard focus while a text field is open. */
  setOverlayFocus(focus: boolean): void;
}
