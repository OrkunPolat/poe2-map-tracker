import { useMemo, useState } from "react";
import { FARM_CATEGORY } from "../../shared/prices";
import { consumablesDiv } from "../../shared/stats";
import type { CostEntry, PriceTable, Settings } from "../../shared/types";
import { api, fmtDiv, fmtValue } from "../api";

const CATEGORIES = [...Object.values(FARM_CATEGORY), "Fragments"];

/**
 * Juice spent per map. Suggests the most expensive consumables of the farm's poe.ninja
 * category (Ritual -> omens, Abyss -> abyss currency...), plus free search and a manual line.
 */
export function CostEditor({
  costs, tabletTypes, prices, settings,
}: { costs: CostEntry[]; tabletTypes: string[]; prices?: PriceTable; settings: Settings }) {
  const farmCats = [...new Set(tabletTypes.map((t) => FARM_CATEGORY[t]).filter((c): c is string => !!c))];
  const [picked, setPicked] = useState<string>();
  const category = picked ?? farmCats[0] ?? "Ritual";
  const top = (prices?.byCategory?.[category] ?? []).slice(0, 10);

  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState("");
  const [customDiv, setCustomDiv] = useState("");

  const add = (name: string, qty: number, unitDiv?: number) => void api().dispatch({ type: "addPendingCost", name, qty, unitDiv });
  const qtyOf = (name: string) => costs.find((c) => c.name === name)?.qty ?? 0;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !prices) return [];
    return Object.keys(prices.divByName).filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
  }, [query, prices]);

  const customValue = Number(customDiv.replace(",", "."));
  const customValid = customName.trim() !== "" && customDiv.trim() !== "" && Number.isFinite(customValue) && customValue >= 0;
  const addCustom = () => {
    if (!customValid) return;
    add(customName.trim(), 1, customValue);
    setCustomName("");
    setCustomDiv("");
  };

  return (
    <div className="cost-form">
      <div className="card-head">
        <h4>Map maliyeti (juice)</h4>
        {costs.length > 0 && <button onClick={() => void api().dispatch({ type: "clearPendingCosts" })}>Temizle</button>}
      </div>

      <div className="seg small">
        {CATEGORIES.map((c) => (
          <button key={c} className={c === category ? "on" : ""} onClick={() => setPicked(c)}>
            {c}
            {farmCats.includes(c) && " •"}
          </button>
        ))}
      </div>

      {top.length === 0 ? (
        <p className="hint">Bu kategori için fiyat yok.</p>
      ) : (
        <div className="cost-grid">
          {top.map((it) => {
            const q = qtyOf(it.name);
            return (
              <button
                key={it.name}
                className={q ? "has" : ""}
                title="Tıkla +1, sağ tık −1"
                onClick={() => add(it.name, 1)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (q) add(it.name, -1);
                }}
              >
                <span className="cost-name">{it.name}</span>
                <span className="cost-price">{fmtValue(it.div, prices?.exPerDiv)}</span>
                {q > 0 && <b>{q}</b>}
              </button>
            );
          })}
        </div>
      )}
      <p className="hint">{category} kategorisinin en pahalı 10 item'ı (poe.ninja). • = tabletlerinle eşleşen farm.</p>

      <div className="row">
        <input className="grow" placeholder="Başka item ara…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {suggestions.length > 0 && (
        <div className="suggest">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                add(s, 1);
                setQuery("");
              }}
            >
              {s} <span className="muted">{fmtValue(prices!.divByName[s]!, prices?.exPerDiv)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <input className="grow" placeholder="Elle: Waystone, Precursor… " value={customName} onChange={(e) => setCustomName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
        <input className="div-input" inputMode="decimal" placeholder="div" value={customDiv} onChange={(e) => setCustomDiv(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
        <button className="primary" disabled={!customValid} onClick={addCustom}>
          Ekle
        </button>
      </div>

      {costs.length > 0 && (
        <table className="loot-table">
          <tbody>
            {costs.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td className="num">{c.qty}×</td>
                <td className="num">{fmtValue(c.qty * c.unitDiv, prices?.exPerDiv)}</td>
                <td className="num">
                  <button className="icon" title="Kaldır" onClick={() => add(c.name, -c.qty)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <span>
          Map başına juice: <b className="gold">{fmtDiv(consumablesDiv({ costs }))} div</b>
        </span>
        <label className="check" style={{ marginLeft: "auto" }}>
          <input type="checkbox" checked={settings.repeatCosts} onChange={(e) => void api().setSettings({ repeatCosts: e.target.checked })} />
          Her map'te tekrarla
        </label>
      </div>
    </div>
  );
}
