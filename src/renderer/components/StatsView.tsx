import { summarizeBySetup } from "../../shared/stats";
import type { PriceTable, Run } from "../../shared/types";
import { fmtDiv, fmtEx } from "../api";

export function StatsView({ runs, prices }: { runs: Run[]; prices?: PriceTable }) {
  const rows = summarizeBySetup(runs, prices);
  if (rows.length === 0) return <p className="empty">İstatistik için önce birkaç map koş.</p>;
  const best = Math.max(...rows.map((r) => r.avgDiv), 0.0001);
  return (
    <div className="table-wrap">
      <table className="runs">
        <thead>
          <tr>
            <th>Tablet setup</th>
            <th className="num">Map</th>
            <th className="num">Toplam div</th>
            <th>Ortalama div / map</th>
            <th className="num">Div / saat</th>
            <th className="num">Ölüm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.setup}>
              <td>{r.setup}</td>
              <td className="num">{r.runs}</td>
              <td className="num">{fmtDiv(r.totalDiv)}</td>
              <td>
                <div className="bar-cell">
                  <div className="bar" style={{ width: `${(r.avgDiv / best) * 100}%` }} />
                  <span>
                    {fmtDiv(r.avgDiv)} <span className="muted">{fmtEx(r.avgDiv, prices?.exPerDiv)}</span>
                  </span>
                </div>
              </td>
              <td className="num">{r.divPerHour != null ? fmtDiv(r.divPerHour) : "–"}</td>
              <td className="num">{r.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Ortalama, map içinde geçen süreye göre hesaplanır; hideout süresi dahil değil. Az örnekli setup'lara temkinli bak.</p>
    </div>
  );
}
