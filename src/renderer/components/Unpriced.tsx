import { useState } from "react";
import type { Snapshot } from "../../shared/ipc";
import { api, fmtDiv } from "../api";

/** Items seen in the stash or in map loot that poe.ninja has no price for (uniques, gems...). */
export function unpricedNames(snap: Snapshot): string[] {
  const has = (n: string) => snap.prices?.divByName[n] != null;
  const names = new Set<string>();
  for (const t of snap.stash.tabs) for (const it of t.items) if (!has(it.name)) names.add(it.name);
  for (const r of snap.state.runs.slice(-100))
    for (const it of r.stashLoot?.items ?? []) if (it.unitDiv == null && !has(it.name) && it.qty > 0) names.add(it.name);
  return [...names].sort();
}

function PriceInput({ name, value }: { name: string; value?: number }) {
  const [v, setV] = useState(value != null ? String(value) : "");
  const save = () => {
    const n = Number(v.replace(",", "."));
    void api().setCustomPrice(name, v.trim() === "" || !Number.isFinite(n) ? undefined : n);
  };
  return (
    <input
      className="div-input"
      inputMode="decimal"
      placeholder="div"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && save()}
    />
  );
}

/** Stash page card: give unpriced items a value once; stash value and map loot use it from then on. */
export function UnpricedCard({ snap }: { snap: Snapshot }) {
  const names = unpricedNames(snap);
  if (names.length === 0) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h3>Fiyatı olmayan item'lar · {names.length}</h3>
        <span className="muted small">poe.ninja'da yok; bir kez değer gir, stash ve map kazancında kullanılır</span>
      </div>
      <table className="loot-table">
        <tbody>
          {names.map((n) => (
            <tr key={n}>
              <td>{n}</td>
              <td className="num">
                <PriceInput name={n} />
              </td>
              <td className="muted">div</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Settings list of the prices the user entered, editable and removable. */
export function CustomPriceList({ snap }: { snap: Snapshot }) {
  const entries = Object.entries(snap.customPrices).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className="muted">Henüz elle fiyat girilmedi. Stash sayfasında fiyatı olmayan item'lar listelenir.</p>;
  return (
    <table className="loot-table">
      <tbody>
        {entries.map(([n, div]) => (
          <tr key={n}>
            <td>{n}</td>
            <td className="num">
              <PriceInput key={`${n}:${div}`} name={n} value={div} />
            </td>
            <td className="num muted">{fmtDiv(div)} div</td>
            <td className="num">
              <button className="icon" title="Sil" onClick={() => void api().setCustomPrice(n, undefined)}>
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
