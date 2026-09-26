import type { Run } from "../shared/types";

export const ALL_LEAGUES = "__all__";

/** Runs saved before league tagging belong to the league that was selected back then: assume the current one. */
export const runLeague = (r: Run, current: string) => r.league ?? current;

export function leaguesOf(runs: Run[], current: string): string[] {
  return [...new Set([current, ...runs.map((r) => runLeague(r, current))].filter(Boolean))];
}

export function inLeague(runs: Run[], league: string, current: string): Run[] {
  return league === ALL_LEAGUES ? runs : runs.filter((r) => runLeague(r, current) === league);
}
