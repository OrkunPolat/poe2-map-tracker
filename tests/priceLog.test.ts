import { describe, expect, it } from "vitest";
import { hourlySeries, recordPrices } from "../src/shared/priceLog";
import type { PriceTable } from "../src/shared/types";

const H = 3600 * 1000;
const table = (annul: number, league = "L") =>
  ({ league, fetchedAt: 0, divByName: { "Chaos Orb": 0.125, "Exalted Orb": 0.002, Annul: annul }, volumeByName: { Annul: 100 } }) as unknown as PriceTable;

describe("hourly price log", () => {
  it("keeps one point per hour, the latest one winning", () => {
    let log = recordPrices(undefined, table(0.7), ["Annul"], 10 * H + 60_000);
    log = recordPrices(log, table(0.8), ["Annul"], 10 * H + 30 * 60_000);
    log = recordPrices(log, table(0.9), ["Annul"], 11 * H + 5_000);
    expect(log.points.map((p) => [p.ts, p.items.Annul![0]])).toEqual([
      [10 * H, 0.8],
      [11 * H, 0.9],
    ]);
  });
  it("converts to each pair currency", () => {
    const log = recordPrices(undefined, table(0.75), ["Annul"], 5 * H);
    expect(hourlySeries(log, "Annul", "chaos")[0]!.rate).toBeCloseTo(6);
    expect(hourlySeries(log, "Annul", "exalted")[0]!.rate).toBeCloseTo(375);
    expect(hourlySeries(log, "Annul", "divine")[0]).toEqual({ ts: 5 * H, rate: 0.75, volume: 100 });
  });
  it("drops old hours and restarts on a new league", () => {
    const old = recordPrices(undefined, table(1), ["Annul"], 0);
    const later = recordPrices(old, table(1), ["Annul"], 15 * 24 * H, 14);
    expect(later.points).toHaveLength(1);
    expect(recordPrices(later, table(1, "New"), ["Annul"], 15 * 24 * H + H).points).toHaveLength(1);
  });
});
