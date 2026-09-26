import { classifyArea, prettyAreaId } from "./logParser";
import type { Run, TabletInfo, TrackerEvent, TrackerState } from "./types";

export interface TrackerOptions {
  /** Tablets stay in the setup and count down uses instead of being cleared after each map. */
  trackTabletUses: boolean;
  defaultTabletUses?: number;
  /** Consumables stay in the setup for the next map. */
  repeatCosts?: boolean;
  /** When set, only this character's deaths are counted. */
  characterName?: string;
  newId?: () => string;
}

export function initialState(): TrackerState {
  return {
    runs: [],
    pending: { tablets: [], screenshots: [] },
    location: { kind: "unknown", areaId: "", areaName: "", since: 0 },
  };
}

/** Identity of a tablet across copies; the uses line changes every map so it is ignored. */
export function tabletKey(t: TabletInfo): string {
  return t.raw
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !/uses?/i.test(l))
    .join("\n")
    .trim();
}

/** Divine charged per map for one tablet, when its price and use count are known. */
export function tabletCostPerUse(t: TabletInfo): number {
  return t.costDiv != null && t.totalUses ? t.costDiv / t.totalUses : 0;
}

const defaultId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function updateRun(state: TrackerState, runId: string | undefined, fn: (r: Run) => Run): TrackerState {
  if (!runId) return state;
  return { ...state, runs: state.runs.map((r) => (r.id === runId ? fn(r) : r)) };
}

/** Close the open in-map time segment of the active run, if any. */
function closeSegment(state: TrackerState, ts: number): TrackerState {
  if (state.segmentStart == null) return state;
  const start = state.segmentStart;
  const next = updateRun(state, state.activeRunId, (r) => ({
    ...r,
    mapTimeMs: r.mapTimeMs + Math.max(0, ts - start),
    endedAt: ts,
  }));
  return { ...next, segmentStart: undefined };
}

export function reduce(state: TrackerState, ev: TrackerEvent, opts: TrackerOptions): TrackerState {
  switch (ev.type) {
    case "areaGenerated": {
      const kind = classifyArea(ev.areaId);
      let s = closeSegment(state, ev.ts);
      s = { ...s, location: { kind, areaId: ev.areaId, areaName: prettyAreaId(ev.areaId), since: ev.ts } };
      if (kind !== "map") return s;

      const active = s.runs.find((r) => r.id === s.activeRunId);
      // Same instance again (portal back in after a hideout trip or death): keep the run going.
      if (active && active.areaId === ev.areaId && active.seed === ev.seed) {
        return { ...s, segmentStart: ev.ts };
      }

      const run: Run = {
        id: (opts.newId ?? defaultId)(),
        startedAt: ev.ts,
        endedAt: ev.ts,
        areaId: ev.areaId,
        areaName: prettyAreaId(ev.areaId),
        areaLevel: ev.level,
        seed: ev.seed,
        waystone: s.pending.waystone,
        tablets: s.pending.tablets,
        costDiv: s.pending.tablets.reduce((sum, t) => sum + tabletCostPerUse(t), 0),
        costs: s.pending.costs ?? [],
        loot: [],
        deaths: 0,
        mapTimeMs: 0,
        screenshots: s.pending.screenshots,
        note: "",
      };
      return {
        ...s,
        runs: [...s.runs, run],
        activeRunId: run.id,
        segmentStart: ev.ts,
        pending: {
          waystone: undefined,
          tablets: opts.trackTabletUses ? consumeUse(s.pending.tablets, opts.defaultTabletUses ?? 10) : [],
          costs: opts.repeatCosts ? (s.pending.costs ?? []) : [],
          screenshots: [],
        },
      };
    }

    case "areaEntered": {
      const s = { ...state, location: { ...state.location, areaName: ev.name } };
      if (state.location.kind !== "map" || state.segmentStart == null) return s;
      return updateRun(s, state.activeRunId, (r) => (r.areaId === state.location.areaId ? { ...r, areaName: ev.name } : r));
    }

    case "slain": {
      if (state.location.kind !== "map" || state.segmentStart == null) return state;
      if (opts.characterName && ev.name !== opts.characterName) return state;
      return updateRun(state, state.activeRunId, (r) => ({ ...r, deaths: r.deaths + 1 }));
    }

    case "waystoneCopied":
      return { ...state, pending: { ...state.pending, waystone: ev.waystone } };

    case "tabletCopied": {
      // Copying a tablet already in the setup (e.g. re-checking it) refreshes its uses instead of adding it twice.
      const key = tabletKey(ev.tablet);
      const idx = state.pending.tablets.findIndex((t) => tabletKey(t) === key);
      if (idx >= 0) {
        const uses = ev.tablet.usesRemaining;
        if (uses == null) return state;
        const tablets = state.pending.tablets.map((t, i) => (i === idx ? { ...t, usesRemaining: uses, usesLeft: uses } : t));
        return { ...state, pending: { ...state.pending, tablets } };
      }
      const tablet = { ...ev.tablet, usesLeft: ev.tablet.usesRemaining };
      return { ...state, pending: { ...state.pending, tablets: [...state.pending.tablets, tablet] } };
    }

    case "updatePendingTablet": {
      const tablets = state.pending.tablets.map((t, i) => (i === ev.index ? { ...t, ...ev.patch } : t));
      return { ...state, pending: { ...state.pending, tablets } };
    }

    case "setPendingTabletsCost": {
      const n = state.pending.tablets.length;
      if (n === 0) return state;
      // "3 tablets for 20 div" -> each tablet carries a third of the price over its uses.
      const tablets = state.pending.tablets.map((t) => ({
        ...t,
        costDiv: ev.totalDiv / n,
        totalUses: ev.usesPerTablet,
        usesLeft: t.usesLeft ?? ev.usesPerTablet,
      }));
      return { ...state, pending: { ...state.pending, tablets } };
    }

    case "screenshot": {
      // Inside a map the shot belongs to that run; otherwise it is part of the next setup.
      if (state.location.kind === "map" && state.activeRunId) {
        return updateRun(state, state.activeRunId, (r) => ({ ...r, screenshots: [...r.screenshots, ev.file] }));
      }
      return { ...state, pending: { ...state.pending, screenshots: [...state.pending.screenshots, ev.file] } };
    }

    case "addLoot":
      return updateRun(state, ev.runId, (r) => {
        const existing = r.loot.find((l) => l.name === ev.name);
        const loot = existing
          ? r.loot.map((l) => (l.name === ev.name ? { ...l, qty: l.qty + ev.qty, unitDiv: l.unitDiv ?? ev.unitDiv } : l))
          : [...r.loot, { name: ev.name, qty: ev.qty, unitDiv: ev.unitDiv }];
        return { ...r, loot: loot.filter((l) => l.qty > 0) };
      });

    case "setLootQty":
      return updateRun(state, ev.runId, (r) => ({
        ...r,
        loot: r.loot.map((l) => (l.name === ev.name ? { ...l, qty: ev.qty } : l)).filter((l) => l.qty > 0),
      }));

    case "addDrop":
      return updateRun(state, ev.runId, (r) => ({ ...r, drops: [...(r.drops ?? []), ev.drop] }));

    case "removeDrop":
      return updateRun(state, ev.runId, (r) => ({ ...r, drops: (r.drops ?? []).filter((d) => d.id !== ev.dropId) }));

    case "setStashLoot":
      return updateRun(state, ev.runId, (r) => ({ ...r, stashLoot: ev.stashLoot }));

    case "setNote":
      return updateRun(state, ev.runId, (r) => ({ ...r, note: ev.note }));

    case "finishRun": {
      const s = closeSegment(state, ev.ts);
      return { ...s, activeRunId: undefined };
    }

    case "deleteRun": {
      const s = { ...state, runs: state.runs.filter((r) => r.id !== ev.runId) };
      return s.activeRunId === ev.runId ? { ...s, activeRunId: undefined, segmentStart: undefined } : s;
    }

    case "removePendingTablet":
      return { ...state, pending: { ...state.pending, tablets: state.pending.tablets.filter((_, i) => i !== ev.index) } };

    case "clearPending":
      return { ...state, pending: { tablets: [], screenshots: [], costs: [] } };

    case "addPendingCost": {
      const costs = state.pending.costs ?? [];
      const hit = costs.find((c) => c.name === ev.name);
      const next = hit
        ? costs.map((c) => (c.name === ev.name ? { ...c, qty: c.qty + ev.qty } : c))
        : [...costs, { name: ev.name, qty: ev.qty, unitDiv: ev.unitDiv }];
      return { ...state, pending: { ...state.pending, costs: next.filter((c) => c.qty > 0) } };
    }

    case "clearPendingCosts":
      return { ...state, pending: { ...state.pending, costs: [] } };

    case "reuseTablets": {
      const run = state.runs.find((r) => r.id === ev.runId);
      return run ? { ...state, pending: { ...state.pending, tablets: run.tablets } } : state;
    }
  }
}

/** One map used every tablet once; spent tablets leave the setup. */
function consumeUse(tablets: TabletInfo[], defaultUses: number): TabletInfo[] {
  return tablets
    .map((t) => ({ ...t, usesLeft: (t.usesLeft ?? t.totalUses ?? defaultUses) - 1 }))
    .filter((t) => t.usesLeft > 0);
}

/** Live map time for the active run, including the still-open segment. */
export function liveMapTime(state: TrackerState, run: Run, now: number): number {
  const open = run.id === state.activeRunId && state.segmentStart != null ? now - state.segmentStart : 0;
  return run.mapTimeMs + Math.max(0, open);
}
