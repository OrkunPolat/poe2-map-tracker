import { Fragment, useState } from "react";
import { formatDuration, runValueDiv, tabletSetupKey } from "../../shared/stats";
import { liveMapTime } from "../../shared/tracker";
import type { PriceTable, Run, TrackerState } from "../../shared/types";
import { api, fmtDiv } from "../api";
import { LootPanel } from "./LootPanel";
import { Screenshots, TabletCard, WaystoneCard } from "./Items";

const pct = (v?: number) => (v == null ? "–" : `${v}%`);

export function RunsTable({
  state, prices, favorites, now,
}: { state: TrackerState; prices?: PriceTable; favorites: string[]; now: number }) {
  const [open, setOpen] = useState<string>();
  const runs = [...state.runs].reverse();

  if (runs.length === 0) {
    return <p className="empty">Henüz map yok. Oyunda bir map'e girdiğinde burada görünür.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="runs">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Map</th>
            <th>Lvl</th>
            <th>T</th>
            <th>Rarity</th>
            <th>Pack</th>
            <th>M.Eff</th>
            <th>Magic</th>
            <th>Rare</th>
            <th>Tabletler</th>
            <th>Süre</th>
            <th>Ölüm</th>
            <th>Loot</th>
            <th className="num">Div</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const w = r.waystone?.stats;
            const isOpen = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr className={`${isOpen ? "open" : ""} ${r.id === state.activeRunId ? "active" : ""}`} onClick={() => setOpen(isOpen ? undefined : r.id)}>
                  <td>{new Date(r.startedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{r.areaName}</td>
                  <td>{r.areaLevel ?? "–"}</td>
                  <td>{w?.tier ?? "–"}</td>
                  <td>{pct(w?.itemRarity)}</td>
                  <td>{pct(w?.packSize)}</td>
                  <td>{pct(w?.monsterEffectiveness)}</td>
                  <td>{pct(w?.magicMonsters)}</td>
                  <td>{pct(w?.rareMonsters)}</td>
                  <td>{tabletSetupKey(r)}</td>
                  <td>{formatDuration(liveMapTime(state, r, now))}</td>
                  <td>{r.deaths || ""}</td>
                  <td className="loot-cell">{r.loot.map((l) => `${l.qty} ${l.name.replace(/ Orb$/, "")}`).join(", ")}</td>
                  <td className="num">
                    <b>{fmtDiv(runValueDiv(r, prices))}</b>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="detail">
                    <td colSpan={14}>
                      <RunDetail run={r} prices={prices} favorites={favorites} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunDetail({ run, prices, favorites }: { run: Run; prices?: PriceTable; favorites: string[] }) {
  const [note, setNote] = useState(run.note);
  return (
    <div className="run-detail">
      <div>
        <h4>Waystone</h4>
        {run.waystone ? <WaystoneCard w={run.waystone} /> : <p className="muted">Kaydedilmedi</p>}
        <h4>Tabletler</h4>
        {run.tablets.length ? run.tablets.map((t, i) => <TabletCard key={i} t={t} />) : <p className="muted">Yok</p>}
        <Screenshots files={run.screenshots} />
      </div>
      <div>
        <h4>Loot</h4>
        <LootPanel run={run} favorites={favorites} prices={prices} />
        <h4>Not</h4>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== run.note && void api().dispatch({ type: "setNote", runId: run.id, note })}
        />
        <div className="row">
          <button onClick={() => void api().dispatch({ type: "reuseTablets", runId: run.id })}>Bu tabletleri hazırlığa kopyala</button>
          <button
            className="danger"
            onClick={() => confirm(`${run.areaName} kaydı silinsin mi?`) && void api().dispatch({ type: "deleteRun", runId: run.id })}
          >
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}
