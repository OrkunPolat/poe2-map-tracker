// Shared by the build-time script and the app's "update from poe2db" button.

const REWARD = /more (Rarity of Items|Pack size|Waystones found|Magic and Rare Monsters)|more Effectiveness|more chance of Monster Modifiers|increased Waystones found|increased number of Rare Monsters|additional Modifiers$/i;

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (s) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
/** "(10-14)% increased" / "16%" -> "#% increased": tiers of one mod share a template. */
export const toTemplate = (line) => line.replace(/\(-?[\d.]+--?[\d.]+\)|[+-]?\d+(\.\d+)?/g, "#").replace(/[+-]#/g, "#");

/** @returns {{id:string, affix:"Prefix"|"Suffix", desecrated:boolean, danger:string[], rewards:string[], tiers:string[][]}[]} */
export function parseWaystoneMods(html) {
  const heads = [...html.matchAll(/<h5[^>]*>([\s\S]*?)<\/h5>/g)].map((m) => ({ at: m.index, title: text(m[1]) }));
  const sectionAt = (i) => heads.filter((h) => h.at < i).pop()?.title ?? "";
  const families = new Map();
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (tds.length < 3) continue;
    const affix = text(tds[1]);
    if (affix !== "Prefix" && affix !== "Suffix") continue;
    const section = sectionAt(m.index);
    if (!/Waystone/i.test(section)) continue;
    const body = tds[2].replace(/<span class="secondary">[\s\S]*?<\/span>/g, "").replace(/<span class="ndash">—<\/span>/g, "-");
    const lines = body.split(/<br\s*\/?>/).map(text).filter(Boolean);
    const danger = lines.filter((l) => !REWARD.test(l));
    const rewards = lines.filter((l) => REWARD.test(l));
    if (danger.length === 0) continue;
    const templates = danger.map(toTemplate);
    const id = `${affix[0]}:${templates.join(" / ")}`;
    const fam = families.get(id) ?? { id, affix, desecrated: /Desecrated/i.test(section), danger: templates, rewards, tiers: [] };
    fam.tiers.push(danger);
    families.set(id, fam);
  }
  return [...families.values()];
}
