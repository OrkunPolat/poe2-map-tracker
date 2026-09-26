import { useMemo, useState } from "react";
import { runCostDiv, runValueDiv, unpricedLoot } from "../../shared/stats";
import type { PriceTable, Run } from "../../shared/types";
import { api, fmtDiv, fmtEx, fmtValue } from "../api";

export function LootPanel({ run, favorites, prices }: { run: Run; favorites: string[]; prices?: PriceTable }) {
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState(1);
  const add = (name: string, n: number) => void api().dispatch({ type: "addLoot", runId: run.id, name, qty: n });

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !prices) return [];
    return Object.keys(prices.divByName)
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, prices]);

  const total = runValueDiv(run, prices);
  const missing = unpricedLoot(run, prices);

  return (
    <div className="loot">
      <div className="fav-grid">
        {favorites.map((name) => {
          const have = run.loot.find((l) => l.name === name)?.qty ?? 0;
          return (
            <div key={name} className={`fav ${have ? "has" : ""}`}>
              <button
                className="fav-main"
                title="Tıkla: +1 · Sağ tık: -1"
                onClick={(e) => add(name, e.shiftKey ? 10 : 1)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (have) add(name, -1);
                }}
              >
                <span className="fav-name">{name.replace(/ Orb$/, "").replace(/^Orb of /, "")}</span>
                <span className="fav-qty">{have || ""}</span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="hint">Tıkla +1, Shift+tık +10, sağ tık −1.</p>

      <div className="row">
        <input
          className="grow"
          placeholder="Başka item ara (ör. Omen, Simulacrum Splinter)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <input className="qty" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
      </div>
      {suggestions.length > 0 && (
        <div className="suggest">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                add(s, qty);
                setQuery("");
                setQty(1);
              }}
            >
              {s} <span className="muted">{fmtDiv(prices!.divByName[s]!)} div</span>
            </button>
          ))}
        </div>
      )}

      {run.loot.length > 0 && (
        <table className="loot-table">
          <tbody>
            {run.loot.map((l) => {
              const unit = l.unitDiv ?? prices?.divByName[l.name];
              return (
                <tr key={l.name}>
                  <td>{l.name}</td>
                  <td>
                    <input
                      className="qty"
                      type="number"
                      min={0}
                      value={l.qty}
                      onChange={(e) =>
                        void api().dispatch({ type: "setLootQty", runId: run.id, name: l.name, qty: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                  <td className="num">{unit != null ? fmtValue(l.qty * unit, prices?.exPerDiv) : "fiyat yok"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <DropsEditor run={run} />

      <div className="total">
        Loot <b>{fmtDiv(total)} div</b> <span className="muted">{fmtEx(total, prices?.exPerDiv)}</span>
        {runCostDiv(run) > 0 && (
          <>
            {" "}− maliyet {fmtDiv(runCostDiv(run))} = net <b>{fmtDiv(total - runCostDiv(run))} div</b>
          </>
        )}
        {missing.length > 0 && <span className="warn"> · fiyatsız: {missing.join(", ")}</span>}
      </div>
    </div>
  );
}

const PRESETS = [0.5, 1, 5, 10, 20];

/** Hand-valued non-currency drops (uniques, bases, jewels...) entered in Divine. */
function DropsEditor({ run }: { run: Run }) {
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const div = Number(value.replace(",", "."));
  const valid = name.trim().length > 0 && value.trim() !== "" && Number.isFinite(div) && div >= 0;

  const submit = () => {
    if (!valid) return;
    void api().dispatch({ type: "addDrop", runId: run.id, name: name.trim(), valueDiv: div });
    setValue("");
    setName("");
  };

  return (
    <div className="drops">
      <h4>Değerli item (unique, base, jewel…)</h4>
      <div className="row">
        <input
          className="div-input"
          inputMode="decimal"
          placeholder="Değer"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <span className="muted">div</span>
        {PRESETS.map((p) => (
          <button key={p} className={`preset ${div === p ? "on" : ""}`} onClick={() => setValue(String(p))}>
            {p}
          </button>
        ))}
      </div>
      <div className="row">
        <input
          className="grow"
          placeholder="Item adı: Mageblood, Headhunter, Spectre…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="primary" disabled={!valid} onClick={submit}>
          Ekle
        </button>
      </div>
      {(run.drops ?? []).length > 0 && (
        <table className="loot-table">
          <tbody>
            {run.drops!.map((d) => (
              <tr key={d.id}>
                <td className="drop-name">{d.name}</td>
                <td className="num">{fmtDiv(d.valueDiv)} div</td>
                <td className="num">
                  <button
                    className="icon"
                    title="Sil"
                    onClick={() => void api().dispatch({ type: "removeDrop", runId: run.id, dropId: d.id })}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
