import { useState } from "react";
import { groupSessions, sessionNetPerHour } from "../../shared/sessions";
import {
  byAvgNet, farmKey, formatDuration, statBucket, summarize, tabletCountKey, type GroupSummary,
} from "../../shared/stats";
import type { PriceTable, Run, WaystoneStats } from "../../shared/types";
import { fmtDiv } from "../api";
import { farmTrends } from "../../shared/trends";
import { Trend } from "./Trend";
import { PageHead } from "../App";
import { SessionCard } from "./SessionCard";
import type { Session } from "../../shared/sessions";

const VIEWS = [
  ["session", "Oturumlar"],
  ["farm", "Farm"],
  ["map", "Map"],
  ["waystone", "Waystone"],
] as const;
type View = (typeof VIEWS)[number][0];

export function StatsView({ runs, prices, gapMin, leaguePicker }: { runs: Run[]; prices?: PriceTable; gapMin: number; leaguePicker?: React.ReactNode }) {
  // "#tab=stats:count" opens a sub-view directly (preview screenshots).
  const [view, setView] = useState<View>(() => VIEWS.find(([id]) => location.hash.endsWith(`:${id}`))?.[0] ?? "session");
  const head = (
    <PageHead title="Analiz" sub={`${runs.length} map`}>
      {leaguePicker}
      <div className="seg">
        {VIEWS.map(([id, label]) => (
          <button key={id} className={view === id ? "on" : ""} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
    </PageHead>
  );
  if (runs.length === 0)
    return (
      <>
        {head}
        <div className="empty">Analiz için önce birkaç map koş.</div>
      </>
    );

  return (
    <div>
      {head}

      {view === "session" && <SessionTable runs={runs} prices={prices} gapMin={gapMin} />}
      {view === "map" && (
        <SummaryTable
          title="Map"
          rows={summarize(runs, (r) => r.areaName, prices).sort(byAvgNet)}
          hint="Aynı map'i birkaç kez koştukça ortalamalar anlamlı hale gelir."
        />
      )}
      {view === "farm" && (
        <SummaryTable
          title="Farm"
          rows={summarize(runs, farmKey, prices).sort(byAvgNet)}
          trends={farmTrends(runs, prices)}
          hint="Farm, en çok kullanılan tablet türüne göre belirlenir (eşitse ikisi birden). Trend: bu farm'dan düşen loot'un fiyatı son 7 günde ne kadar değişti."
        />
      )}
      {view === "farm" && (
        <SummaryTable
          title="Tablet sayısı"
          rows={summarize(runs, tabletCountKey, prices, (r) => r.tablets.length).sort((a, b) => a.order - b.order)}
          hint="City map'lere 4, diğerlerine 3 tabletle girilebiliyor."
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

function SummaryTable({ title, rows, hint, trends }: { title: string; rows: GroupSummary[]; hint?: string; trends?: Map<string, number> }) {
  const best = Math.max(...rows.map((r) => r.avgNet), 0.0001);
  return (
    <div className="table-wrap stat-block">
      <table className="runs summary">
        <colgroup>
          <col style={{ width: "18%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col />
          <col style={{ width: "8%" }} />
          <col style={{ width: "9%" }} />
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
            <th className="num">Ort. süre</th>
            <th className="num">Net / saat</th>
            <th className="num">Ölüm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {r.key} {trends && <Trend change={trends.get(r.key)} />}
              </td>
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
              <td className="num">{r.avgTimeMs ? formatDuration(r.avgTimeMs) : "–"}</td>
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

/** Farm sessions with wall-clock rate: hideout, trade and crafting time count too. */
function SessionTable({ runs, prices, gapMin }: { runs: Run[]; prices?: PriceTable; gapMin: number }) {
  const sessions = groupSessions(runs, gapMin * 60_000, prices).reverse();
  const [card, setCard] = useState<Session | undefined>(() => (location.hash.includes("card") ? sessions[0] : undefined));
  const fmtTime = (ts: number) => new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="table-wrap stat-block">
      <table className="runs">
        <thead>
          <tr>
            <th>Oturum</th>
            <th className="num">Süre</th>
            <th className="num">Map</th>
            <th className="num">Map içi</th>
            <th className="num">Loot</th>
            <th className="num">Net</th>
            <th className="num">Gerçek net / saat</th>
            <th>Farm</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const farms = summarize(s.runs, farmKey, prices).sort((a, b) => b.runs - a.runs).map((g) => `${g.key} (${g.runs})`);
            const rate = sessionNetPerHour(s);
            return (
              <tr key={s.start} className="clickable" onClick={() => setCard(s)} title="Özet kartını aç">
                <td>
                  {fmtTime(s.start)} – {new Date(s.end).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="num">{formatDuration(s.end - s.start)}</td>
                <td className="num">{s.runs.length}</td>
                <td className="num muted">{Math.round((s.mapTimeMs / Math.max(1, s.end - s.start)) * 100)}%</td>
                <td className="num">{fmtDiv(s.lootDiv)}</td>
                <td className="num">
                  <b>{fmtDiv(s.netDiv)}</b>
                </td>
                <td className="num">
                  <b className="gold">{rate != null ? fmtDiv(rate) : "–"}</b>
                </td>
                <td className="muted">{farms.join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        Satıra tıkla: paylaşılabilir özet kartı. {gapMin} dakikadan uzun ara yeni oturum başlatır (Ayarlar'dan değişir). "Gerçek net / saat" hideout, trade ve craft süresini de sayar; "Map içi" zamanın ne kadarının map'te geçtiğini gösterir.
      </p>
      {card && <SessionCard session={card} prices={prices} onClose={() => setCard(undefined)} />}
    </div>
  );
}
