import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseItem, toTablet, toWaystone } from "../src/shared/itemParser";
import { parseLogLine } from "../src/shared/logParser";
import { farmKey, runValueDiv, runsToCsv, statBucket, summarize, tabletSetupKey } from "../src/shared/stats";
import { initialState, reduce, type TrackerOptions } from "../src/shared/tracker";
import type { TrackerEvent, TrackerState } from "../src/shared/types";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
let n = 0;
const opts: TrackerOptions = { trackTabletUses: false, characterName: "Orkun", newId: () => `run${++n}` };

function play(state: TrackerState, events: TrackerEvent[], o = opts) {
  return events.reduce((s, e) => reduce(s, e, o), state);
}

const logEvents = () =>
  fx("client-session.txt").split("\n").map((l) => parseLogLine(l)).filter((e): e is TrackerEvent => e !== null);

describe("tracker", () => {
  it("builds runs from a real-looking session with setup attached", () => {
    n = 0;
    const waystone = toWaystone(parseItem(fx("waystone-rare.txt"))!);
    const tablet = toTablet(parseItem(fx("tablet-advanced.txt"))!);
    const [hideout, ...rest] = logEvents();
    let s = play(initialState(), [hideout!]);
    s = play(s, [
      { type: "waystoneCopied", ts: 0, waystone },
      { type: "tabletCopied", ts: 0, tablet },
      { type: "tabletCopied", ts: 0, tablet }, // duplicate copy ignored
    ]);
    s = play(s, rest);

    expect(s.runs).toHaveLength(2);
    const [grotto, crypt] = s.runs;
    expect(grotto).toMatchObject({ areaName: "Hidden Grotto", areaLevel: 80, deaths: 1 });
    expect(grotto!.waystone?.stats.tier).toBe(15);
    expect(grotto!.tablets).toHaveLength(1);
    // 20:01:00-20:04:10 (190s) + re-entry 20:04:40-20:07:40 (180s); hideout time excluded.
    expect(grotto!.mapTimeMs).toBe(370_000);
    expect(crypt).toMatchObject({ areaId: "MapCrypt", areaLevel: 81 });
    expect(crypt!.waystone).toBeUndefined();
    expect(crypt!.tablets).toHaveLength(0);
    expect(s.activeRunId).toBe(crypt!.id);
    expect(s.location.kind).toBe("map");
  });

  it("keeps tablets for the next run when configured", () => {
    const tablet = toTablet(parseItem(fx("tablet-advanced.txt"))!);
    const s = play(
      initialState(),
      [
        { type: "tabletCopied", ts: 0, tablet },
        { type: "areaGenerated", ts: 1000, level: 80, areaId: "MapA", seed: "1" },
      ],
      { ...opts, trackTabletUses: true },
    );
    expect(s.pending.tablets).toHaveLength(1);
  });

  it("tracks loot, value and setup summaries", () => {
    let s = play(initialState(), [{ type: "areaGenerated", ts: 0, level: 80, areaId: "MapA", seed: "1" }]);
    const id = s.runs[0]!.id;
    s = play(s, [
      { type: "addLoot", runId: id, name: "Divine Orb", qty: 2, unitDiv: 1 },
      { type: "addLoot", runId: id, name: "Orb of Annulment", qty: 1, unitDiv: 0.75 },
      { type: "addLoot", runId: id, name: "Orb of Annulment", qty: -1 },
      { type: "addLoot", runId: id, name: "Exalted Orb", qty: 100 },
      { type: "finishRun", ts: 600_000 },
    ]);
    const run = s.runs[0]!;
    expect(run.loot.map((l) => l.name)).toEqual(["Divine Orb", "Exalted Orb"]);
    const prices = { league: "x", fetchedAt: 0, divByName: { "Exalted Orb": 0.002 } };
    expect(runValueDiv(run, prices)).toBeCloseTo(2.2);
    expect(run.mapTimeMs).toBe(600_000);
    expect(s.activeRunId).toBeUndefined();
    const [sum] = summarize(s.runs, tabletSetupKey, prices);
    expect(sum).toMatchObject({ key: "Tabletsiz", runs: 1 });
    expect(sum!.netPerHour).toBeCloseTo(13.2);
    expect(runsToCsv(s.runs, prices).startsWith("﻿Tarih;Map")).toBe(true);
  });

  it("groups setups independent of tablet order", () => {
    const t = (type: string) => ({ type, rarity: "Magic", name: "", baseType: "", mods: [], raw: type + Math.random() });
    const base = { id: "", startedAt: 0, areaId: "", areaName: "", loot: [], deaths: 0, mapTimeMs: 0, screenshots: [], note: "" };
    expect(tabletSetupKey({ ...base, tablets: [t("Expedition"), t("Delirium"), t("Expedition")] })).toBe("Delirium + Expedition x2");
    expect(tabletSetupKey({ ...base, tablets: [t("Delirium"), t("Expedition"), t("Expedition")] })).toBe("Delirium + Expedition x2");
  });

  it("puts screenshots on the active run inside a map, else on the pending setup", () => {
    let s = play(initialState(), [{ type: "screenshot", ts: 0, file: "a.png" }]);
    expect(s.pending.screenshots).toEqual(["a.png"]);
    s = play(s, [
      { type: "areaGenerated", ts: 1, level: 80, areaId: "MapA", seed: "1" },
      { type: "screenshot", ts: 2, file: "b.png" },
    ]);
    expect(s.runs[0]!.screenshots).toEqual(["a.png", "b.png"]);
  });
});

describe("valuable drops", () => {
  it("adds hand-valued drops to the run value and CSV", () => {
    let s = play(initialState(), [{ type: "areaGenerated", ts: 0, level: 80, areaId: "MapA", seed: "1" }]);
    const id = s.runs[0]!.id;
    s = play(s, [
      { type: "addLoot", runId: id, name: "Divine Orb", qty: 1, unitDiv: 1 },
      { type: "addDrop", runId: id, drop: { id: "x1", name: "Mageblood", valueDiv: 20 } },
      { type: "addDrop", runId: id, drop: { id: "x2", name: "Spectre base", valueDiv: 0.5 } },
      { type: "removeDrop", runId: id, dropId: "x2" },
    ]);
    const run = s.runs[0]!;
    expect(run.drops).toEqual([{ id: "x1", name: "Mageblood", valueDiv: 20 }]);
    expect(runValueDiv(run)).toBe(21);
    expect(runsToCsv(s.runs)).toContain("Mageblood (20 div)");
  });

  it("values runs saved before drops existed", () => {
    const old = { id: "o", startedAt: 0, areaId: "", areaName: "", tablets: [], loot: [], deaths: 0, mapTimeMs: 0, screenshots: [], note: "" };
    expect(runValueDiv(old)).toBe(0);
  });
});

describe("tablet costs", () => {
  const tabletText = (mod: string, uses?: number) =>
    `Item Class: Tablet\nRarity: Magic\nExpedition Precursor Tablet\n--------\nItem Level: 80\n${uses != null ? `Uses Remaining: ${uses}\n` : ""}--------\n${mod}\n`;
  const copy = (mod: string, uses?: number): TrackerEvent => ({ type: "tabletCopied", ts: 0, tablet: toTablet(parseItem(tabletText(mod, uses))!) });
  const enter = (seed: string): TrackerEvent => ({ type: "areaGenerated", ts: Number(seed) * 1000, level: 80, areaId: "MapA", seed });
  const o = { ...opts, trackTabletUses: true, defaultTabletUses: 10 };

  it("spreads '3 tablets for 20 div' over 10 uses each and drops spent tablets", () => {
    let s = play(initialState(), [copy("a"), copy("b"), copy("c"), { type: "setPendingTabletsCost", totalDiv: 20, usesPerTablet: 10 }], o);
    s = play(s, [enter("1")], o);
    expect(s.runs[0]!.costDiv).toBeCloseTo(2); // 3 x (6.67 / 10)
    expect(s.pending.tablets.map((t) => t.usesLeft)).toEqual([9, 9, 9]);
    for (let i = 2; i <= 10; i++) s = play(s, [enter(String(i))], o);
    expect(s.runs).toHaveLength(10);
    expect(s.pending.tablets).toHaveLength(0);
    const total = s.runs.reduce((sum, r) => sum + (r.costDiv ?? 0), 0);
    expect(total).toBeCloseTo(20);
  });

  it("re-copying a tablet refreshes uses instead of duplicating it", () => {
    let s = play(initialState(), [copy("a", 10)], o);
    s = play(s, [enter("1"), copy("a", 9)], o);
    expect(s.pending.tablets).toHaveLength(1);
    expect(s.pending.tablets[0]!.usesLeft).toBe(9);
  });
});

describe("farm grouping", () => {
  const t = (type: string) => ({ type, rarity: "Magic", name: "", baseType: "", mods: [], raw: type });
  const base = { id: "", startedAt: 0, areaId: "", areaName: "", loot: [], deaths: 0, mapTimeMs: 0, screenshots: [], note: "" };
  it("names the farm after the dominant tablet type", () => {
    expect(farmKey({ ...base, tablets: [t("Expedition"), t("Expedition"), t("Delirium")] })).toBe("Expedition");
    expect(farmKey({ ...base, tablets: [t("Breach"), t("Delirium"), t("Delirium"), t("Breach")] })).toBe("Breach + Delirium");
    expect(farmKey({ ...base, tablets: [] })).toBe("Tabletsiz");
  });
  it("buckets waystone stats", () => {
    expect(statBucket(72, 50)).toEqual({ key: "50-99%", order: 50 });
    expect(statBucket(undefined, 50).key).toBe("yok");
  });
  it("computes net after tablet cost", () => {
    const run = { ...base, tablets: [], costDiv: 2, loot: [{ name: "Divine Orb", qty: 5, unitDiv: 1 }], mapTimeMs: 600_000 };
    const [g] = summarize([run], () => "x");
    expect(g).toMatchObject({ avgDiv: 5, avgCost: 2, avgNet: 3 });
    expect(g!.netPerHour).toBeCloseTo(18);
  });
});

describe("consumable costs and sessions", () => {
  it("charges juice to each map and repeats it when configured", async () => {
    const { consumablesDiv, runCostDiv } = await import("../src/shared/stats");
    const o = { ...opts, repeatCosts: true };
    let s = play(initialState(), [
      { type: "addPendingCost", name: "Omen of Light", qty: 1, unitDiv: 7.5 },
      { type: "addPendingCost", name: "Breachstone", qty: 2, unitDiv: 2.5 },
      { type: "areaGenerated", ts: 0, level: 80, areaId: "MapA", seed: "1" },
      { type: "areaGenerated", ts: 1000, level: 80, areaId: "MapB", seed: "2" },
    ], o);
    expect(consumablesDiv(s.runs[0]!)).toBe(12.5);
    expect(runCostDiv(s.runs[1]!)).toBe(12.5);
    s = play(s, [{ type: "clearPendingCosts" }, { type: "areaGenerated", ts: 2000, level: 80, areaId: "MapC", seed: "3" }], o);
    expect(runCostDiv(s.runs[2]!)).toBe(0);
  });

  it("splits sessions on long pauses and measures wall-clock rate", async () => {
    const { groupSessions, sessionNetPerHour } = await import("../src/shared/sessions");
    const min = 60_000;
    const mk = (id: string, start: number, mapMin: number, div: number) => ({
      id, startedAt: start * min, endedAt: (start + mapMin) * min, areaId: "", areaName: id, tablets: [],
      loot: [{ name: "Divine Orb", qty: div, unitDiv: 1 }], deaths: 0, mapTimeMs: mapMin * min, screenshots: [], note: "",
    });
    // two maps 10 min apart, then a 2h break
    const runs = [mk("a", 0, 5, 3), mk("b", 15, 5, 3), mk("c", 200, 5, 4)];
    const sessions = groupSessions(runs, 30 * min);
    expect(sessions.map((x) => x.runs.length)).toEqual([2, 1]);
    // 6 div over 20 wall minutes = 18/h, although map time alone would say 36/h
    expect(sessionNetPerHour(sessions[0]!)).toBeCloseTo(18);
  });
});

describe("stash state", () => {
  it("replaces a re-read tab but keeps counts the user typed in", async () => {
    const { emptyStash, setItemQty, stashValueDiv, upsertTab } = await import("../src/shared/stash");
    const prices = { league: "x", fetchedAt: 0, divByName: { "Omen of Light": 7.5, "Omen of Chance": 17.8 } };
    let s = upsertTab(emptyStash(), { id: "Ritual", label: "Ritual", capturedAt: 1, screenshot: "a.png", items: [{ name: "Omen of Light", qty: 2 }, { name: "Omen of Chance" }] });
    expect(stashValueDiv(s, prices)).toBe(15);
    s = setItemQty(s, "Ritual", "Omen of Chance", 1);
    s = upsertTab(s, { id: "Ritual", label: "Ritual", capturedAt: 2, screenshot: "b.png", items: [{ name: "Omen of Light", qty: 3 }, { name: "Omen of Chance" }] });
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.items).toEqual([{ name: "Omen of Light", qty: 3 }, { name: "Omen of Chance", qty: 1, edited: true }]);
    expect(stashValueDiv(s, prices)).toBeCloseTo(40.3);
  });
});

describe("price trends", () => {
  it("suggests selling what is falling and holding what is rising, by money impact", async () => {
    const { sellHints, farmTrends } = await import("../src/shared/trends");
    const prices = {
      league: "x", fetchedAt: 0,
      divByName: { "Omen of Light": 7.5, "Divine Orb": 1, "Breach Splinter": 0.01, "Perfect Flux": 23 },
      changeByName: { "Omen of Light": -20, "Divine Orb": 0, "Breach Splinter": -50, "Perfect Flux": 15 },
    };
    const stash = { history: [], tabs: [{ id: "a", label: "a", capturedAt: 0, screenshot: "", items: [
      { name: "Omen of Light", qty: 4 }, { name: "Divine Orb", qty: 50 }, { name: "Breach Splinter", qty: 20 }, { name: "Perfect Flux", qty: 1 },
    ] }] };
    const hints = sellHints(stash, prices);
    expect(hints.map((h) => [h.name, h.advice])).toEqual([["Omen of Light", "sell"], ["Perfect Flux", "hold"]]);
    expect(hints[0]!.impactDiv).toBeCloseTo(30 - 30 / 0.8);
    const base = { id: "", startedAt: 0, areaId: "", areaName: "", deaths: 0, mapTimeMs: 0, screenshots: [], note: "" };
    const t = (type: string) => ({ type, rarity: "Magic", name: "", baseType: "", mods: [], raw: type });
    const trends = farmTrends([{ ...base, tablets: [t("Ritual")], loot: [{ name: "Omen of Light", qty: 1 }, { name: "Divine Orb", qty: 7.5 }] }], prices);
    expect(trends.get("Ritual")).toBeCloseTo(-10); // half the value fell 20%, half flat
  });
});

describe("automatic stash diff", () => {
  it("turns two stash readings into map loot and spending, without double counting juice", async () => {
    const { diffQty, toStashLoot, stashQty } = await import("../src/shared/stashDiff");
    const { runValueDiv, runCostDiv } = await import("../src/shared/stats");
    const tab = (items: Array<[string, number]>) => ({ id: "t", label: "t", capturedAt: 0, screenshot: "", source: "trade" as const, items: items.map(([name, qty]) => ({ name, qty })) });
    // Entered the map with 50 div and 2 omens; after stashing the loot: 53 div, 1 omen (one used).
    const before = stashQty([tab([["Divine Orb", 50], ["Omen of Light", 2]])]);
    const after = stashQty([tab([["Divine Orb", 53], ["Omen of Light", 1], ["Chaos Orb", 8]])]);
    const prices = { league: "x", fetchedAt: 0, divByName: { "Divine Orb": 1, "Omen of Light": 7.5, "Chaos Orb": 0.125 } };
    const loot = toStashLoot(diffQty(before, after), prices, 1, 2);
    expect(loot.gainDiv).toBe(4);
    expect(loot.spentDiv).toBe(7.5);
    const run = {
      id: "r", startedAt: 0, areaId: "", areaName: "", tablets: [], loot: [], deaths: 0, mapTimeMs: 0, screenshots: [], note: "",
      costs: [{ name: "Omen of Light", qty: 1, unitDiv: 7.5 }], stashLoot: loot,
    };
    expect(runValueDiv(run)).toBe(4);
    expect(runCostDiv(run)).toBe(7.5); // the omen typed in as juice is the same one the diff saw
  });
});

describe("stash diff corrections", () => {
  const run = (items: Array<[string, number, number?]>, ignored?: string[]) => ({
    stashLoot: { items: items.map(([name, qty, unitDiv]) => ({ name, qty, unitDiv })), gainDiv: 0, spentDiv: 0, beforeAt: 0, afterAt: 0, ignored },
  });
  it("prices unpriced items with user prices and skips ignored lines", async () => {
    const { stashLootTotals } = await import("../src/shared/stashDiff");
    const prices = { league: "x", fetchedAt: 0, divByName: { "Rakiata's Flow": 120 } }; // user-entered
    const r = run([["Divine Orb", 3, 1], ["Rakiata's Flow", 1], ["Mystery Unique", 1], ["Omen of Light", -1, 7.5]]);
    expect(stashLootTotals(r, prices)).toEqual({ gainDiv: 123, spentDiv: 7.5, unpriced: ["Mystery Unique"] });
    const ignoredTrade = run([["Divine Orb", -50, 1], ["Rakiata's Flow", 1]], ["Divine Orb", "Rakiata's Flow"]);
    expect(stashLootTotals(ignoredTrade, prices)).toEqual({ gainDiv: 0, spentDiv: 0, unpriced: [] });
  });

  it("flags maps whose diff looks like a trade or craft", async () => {
    const { stashLootWarnings } = await import("../src/shared/stashDiff");
    const prices = { league: "x", fetchedAt: 0, divByName: { "Divine Orb": 1, "Omen of Light": 7.5 } };
    expect(stashLootWarnings(run([["Divine Orb", 2, 1], ["Omen of Light", -2, 7.5]]), prices, 3)).toEqual([]); // juice is normal
    expect(stashLootWarnings(run([["Divine Orb", -40, 1]]), prices, 3)[0]).toContain("40 Divine Orb azaldı");
    expect(stashLootWarnings(run([["Divine Orb", 60, 1]]), prices, 3)[0]).toContain("normalin 20 katı");
    expect(stashLootWarnings(run([["Divine Orb", -40, 1]], ["Divine Orb"]), prices, 3)).toEqual([]); // user ignored it
  });

  it("tags new runs with the league and lets the user exclude a run", () => {
    let s = play(initialState(), [{ type: "areaGenerated", ts: 0, level: 80, areaId: "MapA", seed: "1" }], { ...opts, league: "Forbidden Rites" });
    expect(s.runs[0]!.league).toBe("Forbidden Rites");
    s = play(s, [{ type: "setExcluded", runId: s.runs[0]!.id, excluded: true }]);
    expect(s.runs[0]!.excluded).toBe(true);
  });
});

describe("GeForce Now mode", () => {
  it("stand-in tablets keep farm and tablet-count stats working", async () => {
    const { gfnTablets } = await import("../src/shared/gfn");
    const { farmKey, tabletCountKey } = await import("../src/shared/stats");
    let s = initialState();
    s = { ...s, pending: { ...s.pending, tablets: gfnTablets("Ritual", 4) } };
    s = play(s, [
      { type: "areaGenerated", ts: 0, level: 0, areaId: "MapGFN", seed: "1" },
      { type: "areaEntered", ts: 0, name: "Ritual map" },
      { type: "areaGenerated", ts: 300_000, level: 0, areaId: "HideoutGFN", seed: "0" },
    ]);
    const r = s.runs[0]!;
    expect(r.areaName).toBe("Ritual map");
    expect(farmKey(r)).toBe("Ritual");
    expect(tabletCountKey(r)).toBe("4 tablet");
    expect(r.mapTimeMs).toBe(300_000);
    expect(s.location.kind).toBe("hideout");
  });
});
