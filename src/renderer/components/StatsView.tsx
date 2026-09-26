import { useState } from "react";
import {
  byAvgNet, farmKey, hourKey, statBucket, summarize, tabletCountKey, tabletSetupKey, type GroupSummary,
} from "../../shared/stats";
import type { PriceTable, Run, WaystoneStats } from "../../shared/types";
import { fmtDiv } from "../api";

const VIEWS = [
  ["farm", "Farm"],
  ["count", "3 vs 4 tablet"],
  ["setup", "Tablet setup"],
  ["hour", "Saatlik"],
  ["waystone", "Waystone"],
] as const;
type View = (typeof VIEWS)[number][0];

export function StatsView({ runs, prices }: { runs: Run[]; prices?: PriceTable }) {
  // "#tab=stats:count" opens a sub-view directly (preview screenshots).
  const [view, setView] = useState<View>(() => VIEWS.find(([id]) => location.hash.endsWith(`:${id}`))?.[0] ?? "farm");
  if (runs.length === 0) return <p className="empty">İstatistik için önce birkaç map koş.</p>;

  return (
    <div>
      <div className="seg">
        {VIEWS.map(([id, label]) => (
          <button key={id} className={view === id ? "on" : ""} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === "farm" && (
        <SummaryTable title="Farm" rows={summarize(runs, farmKey, prices).sort(byAvgNet)} hint="Farm, en çok kullanılan tablet türüne göre belirlenir (eşitse ikisi birden)." />
      )}
      {view === "count" && (
        <SummaryTable
          title="Tablet sayısı"
          rows={summarize(runs, tabletCountKey, prices, (r) => r.tablets.length).sort((a, b) => a.order - b.order)}
          hint="City map'lere 4, diğerlerine 3 tabletle girilebiliyor; bu tablo ikisini karşılaştırır."
        />
      )}
      {view === "setup" && <SummaryTable title="Tablet setup" rows={summarize(runs, tabletSetupKey, prices).sort(byAvgNet)} />}
      {view === "hour" && (
        <SummaryTable
          title="Saat"
          rows={summarize(runs, hourKey, prices, (r) => r.startedAt).sort((a, b) => b.order - a.order)}
          hint="Map'ler başladıkları saate göre gruplanır."
        />
      )}
      {view === "waystone" && (
        <>
          <StatTable title="Item Rarity" stat="itemRarity" step={50} runs={runs} prices={prices} />
          <StatTable title="Pack Size" stat="packSize" step={20} runs={runs} prices={prices} />
          <StatTable title="Monster Effectiveness" stat="monsterEffectiveness" step={20} runs={runs} prices={prices} />
        </>
      )}
    </div>
  );
}

function StatTable({ title, stat, step, runs, prices }: { title: string; stat: keyof WaystoneStats; step: number; runs: Run[]; prices?: PriceTable }) {
  const rows = summarize(runs, (r) => statBucket(r.waystone?.stats[stat], step).key, prices, (r) => statBucket(r.waystone?.stats[stat], step).order);
  return <SummaryTable title={title} rows={rows.sort((a, b) => a.order - b.order)} />;
}

function SummaryTable({ title, rows, hint }: { title: string; rows: GroupSummary[]; hint?: string }) {
  const best = Math.max(...rows.map((r) => r.avgNet), 0.0001);
  return (
    <div className="table-wrap stat-block">
      <table className="runs summary">
        <colgroup>
          <col style={{ width: "20%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col />
          <col style={{ width: "10%" }} />
          <col style={{ width: "6%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>{title}</th>
            <th className="num">Map</th>
            <th className="num">Toplam div</th>
            <th className="num">Ort. loot</th>
            <th className="num">Ort. maliyet</th>
            <th>Ort. net / map</th>
            <th className="num">Net / saat</th>
            <th className="num">Ölüm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td className="num">{r.runs}</td>
              <td className="num">{fmtDiv(r.totalDiv)}</td>
              <td className="num">{fmtDiv(r.avgDiv)}</td>
              <td className="num muted">{r.avgCost ? fmtDiv(r.avgCost) : "–"}</td>
              <td>
                <div className="bar-cell">
                  <div className="bar" style={{ width: `${Math.max(0, r.avgNet / best) * 100}%` }} />
                  <span className={r.avgNet < 0 ? "warn" : ""}>{fmtDiv(r.avgNet)}</span>
                </div>
              </td>
              <td className="num">{r.netPerHour != null ? fmtDiv(r.netPerHour) : "–"}</td>
              <td className="num">{r.deaths || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
