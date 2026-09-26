import type { Snapshot } from "../shared/ipc";
import type { WaystoneInfo } from "../shared/types";
import { dangerousMatches, shortLabel } from "../shared/waystoneDanger";

/** Lines of this waystone that hit a mod the user marked as dangerous. */
export function dangerLines(snap: Snapshot, w: WaystoneInfo | undefined): string[] {
  if (!w || snap.settings.dangerousMods.length === 0) return [];
  return dangerousMatches(w.mods, snap.waystoneMods.families, new Set(snap.settings.dangerousMods)).map((m) => m.line);
}

/** Same, as short labels for the overlay ("Critical Hit Chance"). */
export function dangerLabels(snap: Snapshot, w: WaystoneInfo | undefined): string[] {
  if (!w || snap.settings.dangerousMods.length === 0) return [];
  return dangerousMatches(w.mods, snap.waystoneMods.families, new Set(snap.settings.dangerousMods)).map((m) => shortLabel(m.family.danger[0]!));
}
