import { useState } from "react";
import { farmKey, formatDuration, runNetDiv } from "../../shared/stats";
import type { PriceTable, Run } from "../../shared/types";
import { fmtDiv } from "../api";

const PALETTE = ["#c8a45c", "#6fa8dc", "#e06666", "#93c47d", "#b58ad8", "#f6b26b", "#76d7c4", "#d5a6bd"];
const dayKey = (ts: number) => new Date(ts).toDateString();
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** One day on a clock axis: which map was entered when, how long it took, colour = farm. */
export function DayTimeline({ runs, prices }: { runs: Run[]; prices?: PriceTable }) {
  const days = [...new Set(runs.map((r) => dayKey(r.startedAt)))].sort((a, b) => Date.parse(b) - Date.parse(a));
  const [day, setDay] = useState(days[0]);
  const [hover, setHover] = useState<Run>();
  if (!day) return <p className="empty">Henüz map yok.</p>;

  const list = runs.filter((r) => dayKey(r.startedAt) === day).sort((a, b) => a.startedAt - b.startedAt);
  const dayStart = new Date(day).getTime();
  const end = (r: Run) => Math.max(r.endedAt ?? r.startedAt, r.startedAt + r.mapTimeMs);
  // Axis spans the hours actually played, rounded out to whole hours.
  const fromH = Math.floor((list[0]!.startedAt - dayStart) / 3_600_000);
  const toH = Math.min(24, Math.ceil((Math.max(...list.map(end)) - dayStart) / 3_600_000));
  const span = Math.max(1, toH - fromH) * 3_600_000;
  const x = (ts: number) => ((ts - dayStart - fromH * 3_600_000) / span) * 100;
  const farms = [...new Set(list.map(farmKey))];
  const color = (r: Run) => PALETTE[farms.indexOf(farmKey(r)) % PALETTE.length];
  const total = list.reduce((s, r) => s + runNetDiv(r, prices), 0);

  return (
    <div>
      <div className="row">
        <select value={day} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => (
            <option key={d} value={d}>
              {new Date(d).toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long" })}
            </option>
          ))}
        </select>
        <span className="muted">
          {list.length} map · net <b className="gold">{fmtDiv(total)} div</b>
        </span>
      </div>

      <div className="timeline">
        <div className="tl-axis">
          {Array.from({ length: toH - fromH + 1 }, (_, i) => (
            <span key={i} style={{ left: `${(i / Math.max(1, toH - fromH)) * 100}%` }}>
              {String(fromH + i).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div className="tl-track">
          {list.map((r) => (
            <div
              key={r.id}
              className="tl-block"
              style={{ left: `${x(r.startedAt)}%`, width: `${Math.max(0.4, x(end(r)) - x(r.startedAt))}%`, background: color(r) }}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(undefined)}
            />
          ))}
        </div>
        <div className="tl-legend">
          {farms.map((f, i) => (
            <span key={f}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} /> {f}
            </span>
          ))}
        </div>
        <div className="tl-hover">
          {hover ? (
            <>
              <b>{hover.areaName}</b> · {hhmm(hover.startedAt)} · {formatDuration(hover.mapTimeMs)} · {farmKey(hover)} · net {fmtDiv(runNetDiv(hover, prices))} div
            </>
          ) : (
            <span className="muted">Bir bloğun üstüne gel</span>
          )}
        </div>
      </div>

      <table className="runs">
        <thead>
          <tr>
            <th>Giriş</th>
            <th>Çıkış</th>
            <th>Map</th>
            <th>Farm</th>
            <th className="num">Süre</th>
            <th className="num">Net</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} onMouseEnter={() => setHover(r)}>
              <td>{hhmm(r.startedAt)}</td>
              <td className="muted">{hhmm(end(r))}</td>
              <td>
                <i className="dot-farm" style={{ background: color(r) }} /> {r.areaName}
              </td>
              <td>{farmKey(r)}</td>
              <td className="num">{formatDuration(r.mapTimeMs)}</td>
              <td className="num">{fmtDiv(runNetDiv(r, prices))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
