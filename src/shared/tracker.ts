import { classifyArea, prettyAreaId } from "./logParser";
import type { Run, TrackerEvent, TrackerState } from "./types";

export interface TrackerOptions {
  keepTabletsAfterRun: boolean;
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
          tablets: opts.keepTabletsAfterRun ? s.pending.tablets : [],
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
      // Copying the same tablet twice (e.g. re-checking it) must not add it twice.
      if (state.pending.tablets.some((t) => t.raw === ev.tablet.raw)) return state;
      return { ...state, pending: { ...state.pending, tablets: [...state.pending.tablets, ev.tablet] } };
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
      return { ...state, pending: { tablets: [], screenshots: [] } };

    case "reuseTablets": {
      const run = state.runs.find((r) => r.id === ev.runId);
      return run ? { ...state, pending: { ...state.pending, tablets: run.tablets } } : state;
    }
  }
}

/** Live map time for the active run, including the still-open segment. */
export function liveMapTime(state: TrackerState, run: Run, now: number): number {
  const open = run.id === state.activeRunId && state.segmentStart != null ? now - state.segmentStart : 0;
  return run.mapTimeMs + Math.max(0, open);
}
