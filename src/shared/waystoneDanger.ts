import type { WaystoneModFamily } from "./waystoneModsParse.mjs";
import { toTemplate } from "./waystoneModsParse.mjs";

export type { WaystoneModFamily };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Families whose harmful lines appear on the waystone; only the ones the user marked as dangerous. */
export function dangerousMatches(mods: string[], families: WaystoneModFamily[], marked: Set<string>): Array<{ family: WaystoneModFamily; line: string }> {
  const lines = mods.map((m) => ({ raw: m, t: norm(toTemplate(m)) }));
  const out: Array<{ family: WaystoneModFamily; line: string }> = [];
  for (const f of families) {
    if (!marked.has(f.id)) continue;
    const hit = lines.find((l) => f.danger.some((d) => norm(d) === l.t));
    if (hit) out.push({ family: f, line: hit.raw });
  }
  return out;
}

/**
 * In-game stash search string that dims waystones with any marked mod: "!frag1|frag2".
 * Each fragment is the shortest piece of the mod's text that no other mod shares (like poe2.re).
 */
/** Short label for tight spaces: "Monsters have #% increased Critical Hit Chance" -> "Critical Hit Chance". */
export function shortLabel(template: string): string {
  return template
    .replace(/[+-]?#%?/g, "")
    .replace(/^\s*(Monsters?|Players?|Area)\s+(have|has|deal|are|take|gain|is)\s+/i, "")
    .replace(/^(increased|reduced|more|less|chance to)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function avoidRegex(marked: WaystoneModFamily[], all: WaystoneModFamily[], limit = 250): { regex: string; missing: string[] } {
  const texts = all.map((f) => ({ id: f.id, t: f.danger.map((d) => norm(d.replace(/#%?/g, " "))).join(" | ") }));
  // Fragments must come from text the game prints contiguously, never across a rolled number.
  const segments = (f: WaystoneModFamily) => f.danger[0]!.split(/[+-]?#%?/).map(norm).filter(Boolean);
  const frags: string[] = [];
  const missing: string[] = [];
  for (const f of marked) {
    const segs = segments(f);
    const others = texts.filter((x) => x.id !== f.id).map((x) => x.t);
    let best: string | undefined;
    const maxLen = Math.max(0, ...segs.map((s) => s.length));
    for (let len = 3; len <= maxLen && !best; len++) {
      for (const own of segs) {
        if (best) break;
        for (let i = 0; i + len <= own.length; i++) {
        const frag = own.slice(i, i + len);
        if (frag.startsWith(" ") || frag.endsWith(" ") || /[|"!]/.test(frag)) continue;
        if (!others.some((o) => o.includes(frag))) {
          best = frag;
          break;
        }
        }
      }
    }
    if (best) frags.push(best);
    else missing.push(f.danger[0]!);
  }
  let regex = frags.length ? `"!${frags.join("|")}"` : "";
  while (regex.length > limit && frags.length) {
    missing.push(frags.pop()!);
    regex = frags.length ? `"!${frags.join("|")}"` : "";
  }
  return { regex, missing };
}
