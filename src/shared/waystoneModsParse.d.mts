export interface WaystoneModFamily {
  id: string;
  affix: "Prefix" | "Suffix";
  desecrated: boolean;
  /** Harmful lines with numbers replaced by "#". */
  danger: string[];
  /** What the mod adds (e.g. "16% more Effectiveness"), same for every tier. */
  rewards: string[];
  tiers: string[][];
}
export function toTemplate(line: string): string;
export function parseWaystoneMods(html: string): WaystoneModFamily[];
