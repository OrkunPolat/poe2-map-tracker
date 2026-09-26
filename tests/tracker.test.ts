import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseItem, toTablet, toWaystone } from "../src/shared/itemParser";
import { parseLogLine } from "../src/shared/logParser";
import { runValueDiv, runsToCsv, summarizeBySetup, tabletSetupKey } from "../src/shared/stats";
import { initialState, reduce, type TrackerOptions } from "../src/shared/tracker";
import type { TrackerEvent, TrackerState } from "../src/shared/types";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
let n = 0;
const opts: TrackerOptions = { keepTabletsAfterRun: false, characterName: "Orkun", newId: () => `run${++n}` };

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
      { ...opts, keepTabletsAfterRun: true },
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
    const [sum] = summarizeBySetup(s.runs, prices);
    expect(sum).toMatchObject({ setup: "Tabletsiz", runs: 1 });
    expect(sum!.divPerHour).toBeCloseTo(13.2);
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
