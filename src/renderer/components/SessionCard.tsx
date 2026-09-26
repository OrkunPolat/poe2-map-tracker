import { useRef, useState } from "react";
import type { Session } from "../../shared/sessions";
import { sessionNetPerHour } from "../../shared/sessions";
import { farmKey, formatDuration, runNetDiv, runValueDiv, summarize } from "../../shared/stats";
import type { PriceTable } from "../../shared/types";
import { api, fmtDiv, fmtEx } from "../api";

/** Shareable one-glance summary of a farm session; saved as PNG or copied to the clipboard. */
export function SessionCard({ session, prices, onClose }: { session: Session; prices?: PriceTable; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState<string>();
  const rate = sessionNetPerHour(session);
  const bestRun = [...session.runs].sort((a, b) => runNetDiv(b, prices) - runNetDiv(a, prices))[0];
  // Single most valuable thing that dropped: a hand-valued drop or a loot stack.
  const drops = session.runs.flatMap((r) => [
    ...(r.drops ?? []).map((d) => ({ name: d.name, div: d.valueDiv, map: r.areaName })),
    ...r.loot.map((l) => ({ name: `${l.qty}× ${l.name}`, div: l.qty * (l.unitDiv ?? prices?.divByName[l.name] ?? 0), map: r.areaName })),
  ]);
  const bestDrop = drops.sort((a, b) => b.div - a.div)[0];
  const farms = summarize(session.runs, farmKey, prices).sort((a, b) => b.totalDiv - a.totalDiv);
  const maxFarm = Math.max(...farms.map((f) => f.totalDiv), 0.001);
  const deaths = session.runs.reduce((s, r) => s + r.deaths, 0);
  const day = new Date(session.start).toLocaleDateString("tr-TR", { day: "2-digit", month: "long" });
  const t = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  const capture = async (mode: "save" | "copy") => {
    const r = ref.current!.getBoundingClientRect();
    setMsg(await api().captureRect({ x: r.x, y: r.y, width: r.width, height: r.height }, mode));
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="session-card" ref={ref}>
          <div className="sc-head">
            <div>
              <div className="sc-title">Farm oturumu</div>
              <div className="sc-sub">
                {day} · {t(session.start)}–{t(session.end)}
              </div>
            </div>
            <div className="sc-brand">PoE2 Map Tracker</div>
          </div>
          <div className="sc-kpis">
            <div>
              <span>Net</span>
              <b>{fmtDiv(session.netDiv)} div</b>
              <em>{fmtEx(session.netDiv, prices?.exPerDiv)}</em>
            </div>
            <div>
              <span>Gerçek saatlik</span>
              <b>{rate != null ? fmtDiv(rate) : "–"} div</b>
              <em>hideout dahil</em>
            </div>
            <div>
              <span>Map</span>
              <b>{session.runs.length}</b>
              <em>{formatDuration(session.end - session.start)}</em>
            </div>
            <div>
              <span>Ölüm</span>
              <b>{deaths}</b>
              <em>{Math.round((session.mapTimeMs / Math.max(1, session.end - session.start)) * 100)}% map içi</em>
            </div>
          </div>
          <div className="sc-body">
            <div>
              <h4>Farm'lar</h4>
              {farms.map((f) => (
                <div key={f.key} className="sc-bar">
                  <span className="sc-bar-label">
                    {f.key} <em>({f.runs})</em>
                  </span>
                  <span className="sc-bar-track">
                    <span style={{ width: `${(f.totalDiv / maxFarm) * 100}%` }} />
                  </span>
                  <b>{fmtDiv(f.totalDiv)}</b>
                </div>
              ))}
            </div>
            <div className="sc-best">
              {bestDrop && (
                <div>
                  <h4>En iyi drop</h4>
                  <b className="drop-name">{bestDrop.name}</b>
                  <div>
                    {fmtDiv(bestDrop.div)} div · {bestDrop.map}
                  </div>
                </div>
              )}
              {bestRun && (
                <div>
                  <h4>En iyi map</h4>
                  <b>{bestRun.areaName}</b>
                  <div>
                    net {fmtDiv(runNetDiv(bestRun, prices))} div · loot {fmtDiv(runValueDiv(bestRun, prices))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="row">
          <button className="primary" onClick={() => void capture("save")}>
            PNG olarak kaydet
          </button>
          <button onClick={() => void capture("copy")}>Panoya kopyala</button>
          <button onClick={onClose}>Kapat</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
