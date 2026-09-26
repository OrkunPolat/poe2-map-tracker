import { Fragment, useState } from "react";
import { formatDuration, runNetDiv, runValueDiv, tabletSetupKey } from "../../shared/stats";
import { liveMapTime } from "../../shared/tracker";
import type { PriceTable, Run, TrackerState } from "../../shared/types";
import { api, fmtDiv } from "../api";
import type { Snapshot } from "../../shared/ipc";
import { LootPanel } from "./LootPanel";
import { StashDiff } from "../App";
import { stashLootTotals, stashLootWarnings } from "../../shared/stashDiff";
import { Screenshots, TabletCard, WaystoneCard } from "./Items";

export function RunsTable({
  state, prices, favorites, now, snap,
}: { state: TrackerState; prices?: PriceTable; favorites: string[]; now: number; snap: Snapshot }) {
  const [open, setOpen] = useState<string>();
  const gains = state.runs.filter((r) => r.stashLoot).map((r) => stashLootTotals(r, prices).gainDiv).sort((a, b) => a - b);
  const median = gains.length ? gains[Math.floor(gains.length / 2)]! : 0;
  const suspicious = (r: Run) => stashLootWarnings(r, prices, median).length > 0;
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
            <th>T</th>
            <th>Farm</th>
            <th>Süre</th>
            <th>Ölüm</th>
            <th>Loot</th>
            <th className="num">Değer</th>
            <th className="num">Net</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const w = r.waystone?.stats;
            const isOpen = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr
                  className={`${isOpen ? "open" : ""} ${r.id === state.activeRunId ? "active" : ""} ${r.excluded ? "excluded" : ""}`}
                  onClick={() => setOpen(isOpen ? undefined : r.id)}
                >
                  <td>{new Date(r.startedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{r.areaName}</td>
                  <td className="muted">{w?.tier ?? "–"}</td>
                  <td>{tabletSetupKey(r)}</td>
                  <td>{formatDuration(liveMapTime(state, r, now))}</td>
                  <td>{r.deaths || ""}</td>
                  <td className="loot-cell">
                    {(r.drops ?? []).map((d) => (
                      <span key={d.id} className="drop-name">
                        {d.name}{" "}
                      </span>
                    ))}
                    {[
                      ...(r.stashLoot?.items ?? []).filter((i) => i.qty > 0).map((i) => ({ name: i.name, qty: i.qty })),
                      ...r.loot,
                    ]
                      .map((l) => `${l.qty} ${l.name.replace(/ Orb$/, "")}`)
                      .join(", ")}
                    {r.stashLoot && <span className="pill tiny">stash</span>}
                    {r.excluded && <span className="pill tiny muted-pill">hariç</span>}
                    {!r.excluded && suspicious(r) && <span className="pill tiny warn-pill">şüpheli</span>}
                  </td>
                  <td className="num">{r.stashLoot || r.loot.length || r.drops?.length ? fmtDiv(runValueDiv(r, prices)) : "–"}</td>
                  <td className="num">
                    <b className={runNetDiv(r, prices) < 0 ? "warn" : ""}>{fmtDiv(runNetDiv(r, prices))}</b>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="detail">
                    <td colSpan={9}>
                      <RunDetail run={r} prices={prices} favorites={favorites} snap={snap} />
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

function RunDetail({ run, prices, favorites, snap }: { run: Run; prices?: PriceTable; favorites: string[]; snap: Snapshot }) {
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
        {run.stashLoot && (
          <>
            <h4>Stash farkı (otomatik)</h4>
            <StashDiff run={run} snap={snap} />
          </>
        )}
        <h4>{run.stashLoot ? "Elle eklenen" : "Loot"}</h4>
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
