import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initialState } from "../shared/tracker";
import type { PriceTable, Settings, TrackerState } from "../shared/types";

export interface Persisted {
  version: 1;
  state: TrackerState;
  settings: Settings;
  prices?: PriceTable;
}

export const DEFAULT_SETTINGS: Settings = {
  logPath: "",
  league: "",
  characterName: "",
  screenshotHotkey: "Ctrl+Shift+S",
  favoriteCurrencies: [
    "Divine Orb", "Exalted Orb", "Chaos Orb", "Orb of Annulment",
    "Greater Chaos Orb", "Perfect Chaos Orb", "Perfect Exalted Orb", "Greater Exalted Orb",
  ],
  trackTabletUses: true,
  repeatCosts: true,
  sessionGapMin: 30,
  defaultTabletUses: 10,
  captureCurrencyFromClipboard: false,
  alwaysOnTop: false,
  overlayEnabled: true,
  overlayHotkey: "Ctrl+Shift+O",
  overlayOpacity: 0.9,
};

export class Store {
  private file: string;
  data: Persisted;
  private timer?: NodeJS.Timeout;

  constructor(dir: string) {
    this.file = join(dir, "tracker-data.json");
    this.data = this.load();
  }

  private load(): Persisted {
    if (existsSync(this.file)) {
      try {
        const d = JSON.parse(readFileSync(this.file, "utf8")) as Persisted;
        // Drop settings keys from older versions so they don't linger in the file.
        const { keepTabletsAfterRun: _old, ...settings } = (d.settings ?? {}) as Settings & { keepTabletsAfterRun?: boolean };
        return { ...d, settings: { ...DEFAULT_SETTINGS, ...settings }, state: { ...initialState(), ...d.state } };
      } catch (e) {
        // Never overwrite a file we failed to read; keep it next to the fresh one.
        renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        console.error("tracker-data.json unreadable, moved aside", e);
      }
    }
    return { version: 1, state: initialState(), settings: { ...DEFAULT_SETTINGS } };
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }

  /** Write to a temp file then rename, so a crash mid-write cannot corrupt the data. */
  flush() {
    clearTimeout(this.timer);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
