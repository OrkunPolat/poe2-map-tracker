import { useEffect, useState } from "react";
import type { ModFilter, PriceCheckQuery, PriceCheckState, Listing } from "../shared/priceCheck";
import type { ParsedMod } from "../shared/itemParse";
import { api, fmtDiv } from "./api";

const RARITY_LABEL = { unique: "Unique", rare: "Rare", magic: "Magic", normal: "Normal" } as const;

/** "# to maximum Life" + [37] -> "+37 to maximum Life"; a negative "increased" reads as "reduced". */
const modText = (m: ParsedMod) => {
  let i = 0;
  let t = (m.statText ?? m.raw).split("\n")[0]!;
  const neg = m.values.length === 1 && m.values[0]! < 0 && /\b(increased|more)\b/.test(t);
  if (neg) t = t.replace(/\bincreased\b/, "reduced").replace(/\bmore\b/, "less");
  return t.replace(/(^|\s)#( to )/, "$1+#$2").replace(/#/g, () => {
    const v = m.values[i++];
    return v == null ? "#" : String(neg ? Math.abs(v) : v);
  });
};

const CURRENCY_SHORT: Record<string, string> = { divine: "div", exalted: "ex", chaos: "chaos" };

const ago = (iso: string) => {
  const h = (Date.now() - Date.parse(iso)) / 3600000;
  if (!(h >= 0)) return "";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk`;
  if (h < 48) return `${Math.round(h)} sa`;
  return `${Math.round(h / 24)} gün`;
};

const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

/** The window the price check hotkey opens: the item's mods to pick from, and what trade asks for similar items. */
export function PriceCheck() {
  const [s, setS] = useState<PriceCheckState>();
  const [q, setQ] = useState<PriceCheckQuery>();
  const [added, setAdded] = useState<string>();

  useEffect(() => {
    void api().priceCheckGet().then(setS);
    return api().onPriceCheck(setS);
  }, []);
  // A new item replaces the form; results of the same item keep what the user picked.
  useEffect(() => {
    if (s?.phase === "ready" || (s?.query && !q)) setQ(s.query);
    if (s?.phase === "reading") {
      setQ(undefined);
      setAdded(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.phase, s?.item]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") api().priceCheckClose();
      if (e.key === "Enter" && q && s?.phase !== "searching") void api().priceCheckSearch(q);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, s?.phase]);

  if (!s) return null;
  const item = s.item;
  const setMod = (i: number, patch: Partial<ModFilter>) => q && setQ({ ...q, mods: q.mods.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const picked = new Set(q?.mods.filter((m) => m.enabled).map((m) => m.statId));
  const mods = item?.mods.filter((m) => m.statId) ?? [];

  return (
    <div className="pc">
      <header className="pc-head">
        {item ? (
          <div className={`pc-title r-${item.rarity}`}>
            {item.name && <b>{item.name}</b>}
            <span>{item.baseType}</span>
          </div>
        ) : (
          <div className="pc-title">
            <b>Fiyat kontrolü</b>
          </div>
        )}
        <button className="pc-x" title="Kapat (Esc)" onClick={() => api().priceCheckClose()}>
          ×
        </button>
      </header>

      {s.phase === "reading" && <p className="pc-note">Item okunuyor…</p>}
      {s.error && <p className="pc-note warn">{s.error}</p>}

      {item && q && (
        <>
          <div className="pc-meta">
            <span className={`pc-rarity r-${item.rarity}`}>{RARITY_LABEL[item.rarity]}</span>
            {item.itemClass && <span>{item.itemClass}</span>}
            {item.itemLevel != null && <span>ilvl {item.itemLevel}</span>}
            {item.corrupted && <span className="warn">Corrupted</span>}
          </div>

          <div className="pc-filters">
            {item.rarity === "unique" && item.name && (
              <label className="pc-chip">
                <input type="checkbox" checked={q.useName} onChange={(e) => setQ({ ...q, useName: e.target.checked })} />
                İsim: {item.name}
              </label>
            )}
            {item.baseType && (
              <label className="pc-chip">
                <input type="checkbox" checked={q.useBase} onChange={(e) => setQ({ ...q, useBase: e.target.checked })} />
                {q.useBase ? `Taban: ${item.baseType}` : `Sınıf: ${item.itemClass ?? "hepsi"}`}
              </label>
            )}
            <label className="pc-chip">
              ilvl ≥
              <input className="pc-num" placeholder="–" value={q.ilvlMin ?? ""} onChange={(e) => setQ({ ...q, ilvlMin: num(e.target.value) })} />
            </label>
            <label className="pc-chip">
              Corrupted
              <select value={q.corrupted} onChange={(e) => setQ({ ...q, corrupted: e.target.value as PriceCheckQuery["corrupted"] })}>
                <option value="any">farketmez</option>
                <option value="yes">evet</option>
                <option value="no">hayır</option>
              </select>
            </label>
            <label className="pc-chip">
              <input type="checkbox" checked={q.online} onChange={(e) => setQ({ ...q, online: e.target.checked })} />
              Sadece çevrimiçi
            </label>
          </div>

          <div className="pc-mods">
            {mods.map((m, i) => {
              const f = q.mods[i];
              if (!f) return null;
              return (
                <div key={i} className={`pc-mod ${f.enabled ? "on" : ""} s-${m.section}`}>
                  <label className="pc-mod-text">
                    <input type="checkbox" checked={f.enabled} onChange={(e) => setMod(i, { enabled: e.target.checked })} />
                    <span title={m.raw}>
                      {modText(m)}
                      {m.range && <em className="pc-range"> ({m.range[0]}–{m.range[1]})</em>}
                      {(m.corrected || m.score < 0.95) && <em className="pc-check" title={`Okunan: ${m.raw}`}> kontrol et</em>}
                    </span>
                  </label>
                  <input className="pc-num" placeholder="min" value={f.min ?? ""} onChange={(e) => setMod(i, { min: num(e.target.value), enabled: true })} />
                  <input className="pc-num" placeholder="max" value={f.max ?? ""} onChange={(e) => setMod(i, { max: num(e.target.value), enabled: true })} />
                </div>
              );
            })}
            {mods.length === 0 && <p className="pc-note">Mod okunamadı; isim ya da tabanla aranabilir.</p>}
          </div>

          <div className="pc-actions">
            <button className="primary" disabled={s.phase === "searching"} onClick={() => void api().priceCheckSearch(q)}>
              {s.phase === "searching" ? (s.waitSeconds ? `Trade sınırı: ${s.waitSeconds} sn` : "Aranıyor…") : `Ara (${picked.size} mod)`}
            </button>
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer">
                Trade sitesinde aç
              </a>
            )}
          </div>
        </>
      )}

      {s.listings && (
        <section className="pc-results">
          <div className="pc-summary">
            <span>
              {s.total ?? 0} ilan{s.total && s.total > s.listings.length ? ` · en ucuz ${s.listings.length}` : ""}
            </span>
            {s.suggestedDiv != null && (
              <span className="pc-suggest">
                Tahmini <b>{fmtDiv(s.suggestedDiv)} div</b>
                <button
                  disabled={!!added}
                  title="En ucuz 5 ilanın ortancası; bu map'in değerli drop'larına eklenir"
                  onClick={() =>
                    void api()
                      .priceCheckAddToMap(s.suggestedDiv!)
                      .then((ok) => setAdded(ok ? "Map'e eklendi" : "Eklenecek map yok"))
                  }
                >
                  {added ?? "Map loot'una ekle"}
                </button>
              </span>
            )}
          </div>
          {s.listings.length === 0 && <p className="pc-note">Bu filtrelerle ilan yok; bir modu kaldırıp ya da min değerleri düşürüp tekrar dene.</p>}
          {s.listings.map((l) => (
            <ListingRow key={l.id} l={l} picked={picked} />
          ))}
        </section>
      )}
    </div>
  );
}

function ListingRow({ l, picked }: { l: Listing; picked: Set<string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pc-listing" onClick={() => setOpen(!open)}>
      <div className="pc-listing-top">
        <b className="pc-price">
          {l.amount} {CURRENCY_SHORT[l.currency] ?? l.currency}
        </b>
        <span className="muted">{l.div != null ? `${fmtDiv(l.div)} div` : ""}</span>
        <span className="muted">{l.ilvl != null ? `ilvl ${l.ilvl}` : ""}</span>
        {l.corrupted && <span className="warn">corr</span>}
        <span className="muted pc-age">{ago(l.indexed)}</span>
      </div>
      <ul className={`pc-listing-mods ${open ? "open" : ""}`}>
        {l.mods.map((m, i) => (
          <li key={i} className={m.statId && picked.has(m.statId) ? "hit" : ""}>
            {m.tier && <span className="pc-tier">{m.tier}</span>}
            {m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
