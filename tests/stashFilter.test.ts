import { describe, expect, it } from "vitest";
import { filterStash, minItemDiv, stashValueDiv } from "../src/shared/stash";
import { stashQty } from "../src/shared/stashDiff";
import type { PriceTable, StashState } from "../src/shared/types";

const prices = { league: "x", fetchedAt: 0, divByName: { "Chaos Orb": 0.125, "Exalted Orb": 0.002, "Rune A": 0.05, Omen: 2 } } as PriceTable;
const stash: StashState = {
  history: [],
  tabs: [
    { id: "trade:~price 991 divine Ritual", label: "Ritual", source: "trade", capturedAt: 0, items: [{ name: "Omen", qty: 2 }, { name: "Unknown", qty: 1 }] },
    { id: "trade:~price 998 divine Rune", label: "Rune", source: "trade", capturedAt: 0, items: [{ name: "Rune A", qty: 100 }] },
  ],
} as unknown as StashState;

describe("stash filter", () => {
  it("drops items under the threshold from the total", () => {
    const min = minItemDiv({ stashMinValue: { amount: 1, unit: "chaos" } }, prices);
    expect(min).toBeCloseTo(0.125);
    expect(stashValueDiv(stash, prices)).toBeCloseTo(9);
    expect(stashValueDiv(stash, prices, min)).toBeCloseTo(4);
    // Unpriced items stay visible; the cheap rune is gone.
    expect(filterStash(stash, prices, min).tabs.map((t) => t.items.length)).toEqual([2, 0]);
  });
  it("is off without a price or amount", () => {
    expect(minItemDiv({}, prices)).toBe(0);
    expect(minItemDiv({ stashMinValue: { amount: 1, unit: "chaos" } }, { ...prices, divByName: {} })).toBe(0);
  });
  it("leaves slow tabs out of the per-map diff", () => {
    expect(stashQty(stash.tabs, new Set([998]))).toEqual({ Omen: 2, Unknown: 1 });
  });
});

import { hourlyUnits, priceHistory } from "../src/shared/trends";
describe("price history", () => {
  const p = {
    league: "x", fetchedAt: 0,
    divByName: { Omen: 2, "Chaos Orb": 0.1 },
    sparkByName: { Omen: [0, 50, 100], "Chaos Orb": [0, 0, 100] },
    volumeByName: { Omen: 40 },
  } as unknown as PriceTable;
  it("anchors the sparkline on today's price", () => {
    expect(priceHistory("Omen", p, "div")).toEqual([1, 1, 1.5, 2]);
  });
  it("divides by that day's chaos price", () => {
    // Chaos was 0.05 div until today's 0.1, so Omen went 20 -> 20 -> 30 -> 20 chaos.
    expect(priceHistory("Omen", p, "chaos")!.map((v) => Math.round(v))).toEqual([20, 20, 30, 20]);
  });
  it("turns Divine volume into units", () => {
    expect(hourlyUnits("Omen", p)).toBe(20);
    expect(priceHistory("Nope", p, "div")).toBeUndefined();
  });
});
