import type { TabletInfo } from "./types";

/** Farm choices in GeForce Now mode (no clipboard there, so tablets cannot be read). */
export const GFN_FARMS = ["Expedition", "Ritual", "Breach", "Abyss", "Delirium", "Diğer"];

/** Stand-in tablets so farm and 3-vs-4 statistics work the same as with copied tablets. */
export function gfnTablets(farm: string, count: number): TabletInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    type: farm,
    rarity: "Normal",
    name: "",
    baseType: `${farm} tableti`,
    mods: [],
    raw: `gfn:${farm}:${i}`,
  }));
}
