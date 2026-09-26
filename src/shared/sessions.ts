import { runNetDiv, runValueDiv } from "./stats";
import type { PriceTable, Run } from "./types";

export interface Session {
  start: number;
  end: number;
  runs: Run[];
  lootDiv: number;
  netDiv: number;
  /** Time actually inside maps; the rest is hideout, trade, crafting. */
  mapTimeMs: number;
}

/**
 * Splits runs into farm sessions: a pause longer than `gapMs` between one map ending and the
 * next starting begins a new session. Wall-clock time then includes hideout and trade time,
 * which the per-map "net/saat" figures leave out.
 */
export function groupSessions(runs: Run[], gapMs: number, prices?: PriceTable): Session[] {
  const sorted = [...runs].sort((a, b) => a.startedAt - b.startedAt);
  const sessions: Session[] = [];
  for (const r of sorted) {
    const end = Math.max(r.endedAt ?? r.startedAt, r.startedAt + r.mapTimeMs);
    const cur = sessions[sessions.length - 1];
    if (cur && r.startedAt - cur.end <= gapMs) {
      cur.runs.push(r);
      cur.end = Math.max(cur.end, end);
    } else {
      sessions.push({ start: r.startedAt, end, runs: [r], lootDiv: 0, netDiv: 0, mapTimeMs: 0 });
    }
  }
  for (const s of sessions) {
    s.lootDiv = s.runs.reduce((a, r) => a + runValueDiv(r, prices), 0);
    s.netDiv = s.runs.reduce((a, r) => a + runNetDiv(r, prices), 0);
    s.mapTimeMs = s.runs.reduce((a, r) => a + r.mapTimeMs, 0);
  }
  return sessions;
}

/** Net Divine per wall-clock hour; `now` extends a session that is still going. */
export function sessionNetPerHour(s: Session, now?: number): number | undefined {
  const ms = (now ?? s.end) - s.start;
  return ms > 60_000 ? s.netDiv / (ms / 3_600_000) : undefined;
}

/** The session still in progress: it holds the map being played, or its last map ended less than `gapMs` ago. */
export function currentSession(sessions: Session[], now: number, gapMs: number, activeRunId?: string): Session | undefined {
  const last = sessions[sessions.length - 1];
  if (!last) return undefined;
  if (activeRunId) return last.runs.some((r) => r.id === activeRunId) ? last : undefined;
  return now - last.end <= gapMs ? last : undefined;
}
