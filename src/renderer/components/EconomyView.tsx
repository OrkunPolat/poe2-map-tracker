import { Fragment, useMemo, useState } from "react";
import type { Snapshot } from "../../shared/ipc";
import type { PriceTable } from "../../shared/types";
import { hourlyUnits } from "../../shared/trends";
import { PageHead } from "../App";
import { fmtValue } from "../api";
import { ItemDetail, fmtCompact } from "./ItemDetail";
import { Trend } from "./Trend";

/** poe.ninja's Currency Exchange categories, in its sidebar order, with its names. */
const CATEGORIES: Array<[type: string, label: string]> = [
  ["Currency", "Currency"],
  ["Fragments", "Fragments"],
  ["Abyss", "Abyssal Bones"],
  ["UncutGems", "Uncut Gems"],
  ["LineageSupportGems", "Lineage Gems"],
  ["Essences", "Essences"],
  ["SoulCores", "Soul Cores"],
  ["Idols", "Idols"],
  ["Runes", "Runes"],
  ["Ritual", "Omens"],
  ["Expedition", "Expedition"],
  ["Delirium", "Liquid Emotions"],
  ["Breach", "Catalysts"],
  ["Verisium", "Verisium"],
];

type SortKey = "name" | "price" | "change" | "volume" | "owned";
const CAT_KEY = "economyCategory";

function loadCategory(): string {
  try {
    return localStorage.getItem(CAT_KEY) ?? "Currency";
  } catch {
    return "Currency";
  }
}

/** Tiny 7-day line for a table row (poe.ninja sparkline, % vs 7 days ago). */
function Spark({ data }: { data?: number[] }) {
  if (!data || data.length < 2) return null;
  const pts = [0, ...data];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * 60).toFixed(1)},${(18 - ((v - min) / span) * 16).toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1]! >= 0;
  return (
    <svg className={`spark ${up ? "up" : "down"}`} width="60" height="20" viewBox="0 0 60 20" aria-hidden>
      <polyline points={d} />
    </svg>
  );
}

/** Every Currency Exchange item with its current price, like poe.ninja's economy pages. */
export function EconomyView({ snap }: { snap: Snapshot }) {
  const { prices, stash } = snap;
  const [cat, setCat] = useState(loadCategory);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "price", desc: true });
  const [open, setOpen] = useState<string>();

  const owned = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of stash.tabs) for (const it of t.items) if (it.qty) m.set(it.name, (m.get(it.name) ?? 0) + it.qty);
    return m;
  }, [stash]);

  const pick = (c: string) => {
    setCat(c);
    setOpen(undefined);
    try {
      localStorage.setItem(CAT_KEY, c);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const q = query.trim().toLowerCase();
  // A search looks through every category, so an item is found without knowing where poe.ninja files it.
  const names = q
    ? CATEGORIES.flatMap(([t]) => prices?.byCategory?.[t] ?? []).filter((i) => i.name.toLowerCase().includes(q))
    : (prices?.byCategory?.[cat] ?? []);
  const value = (name: string, key: SortKey): number | string => {
    switch (key) {
      case "name":
        return name;
      case "price":
        return prices?.divByName[name] ?? 0;
      case "change":
        return prices?.changeByName?.[name] ?? -Infinity;
      case "volume":
        return prices?.volumeByName?.[name] ?? 0;
      case "owned":
        return owned.get(name) ?? 0;
    }
  };
  const rows = [...names].sort((a, b) => {
    const x = value(a.name, sort.key);
    const y = value(b.name, sort.key);
    const r = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
    return sort.desc ? -r : r;
  });
  const head = (key: SortKey, label: string, cls = "") => (
    <th className={`sortable ${cls} ${sort.key === key ? "on" : ""}`} onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== "name" })}>
      {label}
      {sort.key === key && <span className="arrow">{sort.desc ? "▾" : "▴"}</span>}
    </th>
  );

  return (
    <div className="economy">
      <PageHead title="Ekonomi" sub={prices ? `${prices.league} · Currency Exchange fiyatları (poe.ninja)` : "Fiyat yok"}>
        <input className="eco-search" placeholder="Item ara…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </PageHead>
      {!prices ? (
        <p className="muted">Fiyatlar henüz yüklenmedi.</p>
      ) : (
        <div className="eco-layout">
          <nav className="eco-cats">
            {CATEGORIES.map(([t, label]) => {
              const items = prices.byCategory?.[t] ?? [];
              const icon = catIcon(prices, t);
              return (
                <button key={t} className={!q && cat === t ? "on" : ""} onClick={() => (setQuery(""), pick(t))}>
                  {icon ? <img src={icon} alt="" /> : <span className="eco-noicon" />}
                  <span className="eco-cat-name">{label}</span>
                  <span className="eco-count">{items.length}</span>
                </button>
              );
            })}
          </nav>
          <section className="card eco-table-card">
            <table className="eco-table">
              <thead>
                <tr>
                  {head("name", q ? `"${query.trim()}" · ${rows.length} sonuç` : (CATEGORIES.find(([t]) => t === cat)?.[1] ?? cat))}
                  {head("price", "Değer", "num")}
                  {head("change", "7 gün", "num")}
                  {head("volume", "Hacim / saat", "num")}
                  {head("owned", "Stash'te", "num")}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ name }) => {
                  const perHour = hourlyUnits(name, prices);
                  const have = owned.get(name);
                  const unit = prices.divByName[name];
                  return (
                    <Fragment key={name}>
                      <tr className={`clickable ${open === name ? "open" : ""}`} onClick={() => setOpen(open === name ? undefined : name)}>
                        <td className="eco-name">
                          {prices.imageByName?.[name] ? <img src={prices.imageByName[name]} alt="" /> : <span className="eco-noicon" />}
                          <span className="name-text" title={name}>
                            {name}
                          </span>
                        </td>
                        <td className="num">{unit != null ? fmtValue(unit, prices.exPerDiv) : "–"}</td>
                        <td className="num eco-change">
                          <Spark data={prices.sparkByName?.[name]} />
                          <Trend change={prices.changeByName?.[name]} />
                        </td>
                        <td className="num muted" title={perHour != null ? `~${Math.round(perHour)} adet/saat` : undefined}>
                          {prices.volumeByName?.[name] != null ? `${fmtCompact(prices.volumeByName[name]!)} div` : "–"}
                        </td>
                        <td className="num">
                          {have ? (
                            <>
                              {have} <span className="muted">· {fmtValue(have * (unit ?? 0), prices.exPerDiv)}</span>
                            </>
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </td>
                      </tr>
                      {open === name && (
                        <tr className="detail-row">
                          <td colSpan={5}>
                            <ItemDetail name={name} qty={have} prices={prices} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Sonuç yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}

/** A category's icon: its most expensive item, like a shelf label. */
function catIcon(prices: PriceTable, type: string): string | undefined {
  for (const it of prices.byCategory?.[type] ?? []) {
    const src = prices.imageByName?.[it.name];
    if (src) return src;
  }
  return undefined;
}
