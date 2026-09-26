import type { LocationKind, TrackerEvent } from "./types";

// Client.txt lines look like:
// 2026/09/26 20:01:02 123456789 abcdef12 [DEBUG Client 1234] Generating level 80 area "MapCrypt" with seed 123
// 2026/09/26 20:01:04 123458789 abcdef12 [INFO Client 1234] : You have entered Crypt.
const TIMESTAMP = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const GENERATING = /Generating level (\d+) area "([^"]+)"(?: with seed (\d+))?/;
const ENTERED = /\] : You have entered (.+?)\.\s*$/;
const SLAIN = /\] : (.+?) has been slain\.\s*$/;

export function parseTimestamp(line: string): number | undefined {
  const m = TIMESTAMP.exec(line);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  return new Date(y!, mo! - 1, d!, h!, mi!, s!).getTime();
}

export function parseLogLine(line: string, fallbackTs = Date.now()): TrackerEvent | null {
  const ts = parseTimestamp(line) ?? fallbackTs;
  let m = GENERATING.exec(line);
  if (m) return { type: "areaGenerated", ts, level: Number(m[1]), areaId: m[2]!, seed: m[3] };
  m = ENTERED.exec(line);
  if (m) return { type: "areaEntered", ts, name: m[1]! };
  m = SLAIN.exec(line);
  if (m) return { type: "slain", ts, name: m[1]! };
  return null;
}

export function classifyArea(areaId: string): LocationKind {
  if (/^Hideout/i.test(areaId)) return "hideout";
  if (/^Map/i.test(areaId)) return "map";
  if (/town/i.test(areaId)) return "town";
  return "other";
}

/** "MapHiddenGrotto" -> "Hidden Grotto"; used until "You have entered" gives the real name. */
export function prettyAreaId(areaId: string): string {
  return areaId
    .replace(/^Map/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}
