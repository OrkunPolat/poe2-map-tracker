import { useEffect, useRef, useState } from "react";
import { counted, formatDuration, hourKeyAt, runCostDiv, runNetDiv, tabletSetupKey } from "../shared/stats";
import { currentSession, groupSessions, sessionNetPerHour } from "../shared/sessions";
import { liveMapTime } from "../shared/tracker";
import type { Run } from "../shared/types";
import { api, fmtDiv, useNow, useSnapshot } from "./api";
import { dangerLabels } from "./danger";

/** Compact always-on-top panel shown over the game (top-right by default). */
export function Overlay() {
  const snap = useSnapshot();
  const now = useNow();
  const ref = useRef<HTMLDivElement>(null);
  const [dropOpen, setDropOpen] = useState(false);

  // Size the frameless window to whatever the panel currently needs.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => api().resizeOverlay(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [snap === undefined]);

  if (!snap) return null;
  const { state, prices, settings, status } = snap;
  const active = state.runs.find((r) => r.id === state.activeRunId);
  const last = active ?? state.runs[state.runs.length - 1];
  const inMap = state.location.kind === "map" && !!active;
  const { pending } = state;
  const quick = settings.favoriteCurrencies.slice(0, 4);
  const hourRuns = state.runs.filter((r) => hourKeyAt(r.startedAt) === hourKeyAt(now));
  const hourNet = hourRuns.reduce((s, r) => s + runNetDiv(r, prices), 0);
  const gapMs = settings.sessionGapMin * 60_000;
  const liveRuns = counted(state.runs.filter((r) => (r.league ?? settings.league) === settings.league));
  const session = currentSession(groupSessions(liveRuns, gapMs, prices), now, gapMs, !!active);

  return (
    <div className="ov" ref={ref}>
      <div className="ov-head">
        <span className={`ov-dot ${inMap ? "live" : ""}`} />
        <span className="ov-title">{inMap ? active!.areaName : state.location.kind === "hideout" ? "Hideout" : "PoE2 Tracker"}</span>
        {inMap && (
          <span className="ov-meta">
            {formatDuration(liveMapTime(state, active!, now))}
            {active!.deaths > 0 && <span className="ov-death"> · {active!.deaths} ölüm</span>}
          </span>
        )}
        <button className="ov-btn" title="Ana pencereyi aç" onClick={() => api().showMain()}>
          ⤢
        </button>
      </div>

      {(() => {
        const d = dangerLabels(snap, inMap ? active!.waystone : pending.waystone);
        return d.length ? <div className="ov-danger">⚠ {d.join(" · ")}</div> : null;
      })()}
      {inMap ? (
        <div className="ov-line">
          {active!.waystone ? `T${active!.waystone.stats.tier ?? "?"}` : "Waystone yok"}
          {active!.waystone?.stats.itemRarity != null && ` · R ${active!.waystone.stats.itemRarity}%`}
          {active!.waystone?.stats.packSize != null && ` · P ${active!.waystone.stats.packSize}%`}
          {" · "}
          {active!.tablets.length ? tabletSetupKey(active!) : "tabletsiz"}
        </div>
      ) : (
        <div className="ov-line">
          Hazır: {pending.waystone ? `T${pending.waystone.stats.tier ?? "?"}` : "waystone yok"} · {pending.tablets.length} tablet
          {pending.tablets.length > 0 && ` (${pending.tablets.map((t) => t.usesLeft ?? "?").join("/")} hak)`}
        </div>
      )}

      {last && (
        <>
          <div className="ov-loot">
            {quick.map((name) => {
              const q = last.loot.find((l) => l.name === name)?.qty ?? 0;
              return (
                <button
                  key={name}
                  className={q ? "has" : ""}
                  title={`${name}: tıkla +1, sağ tık −1`}
                  onClick={() => void api().dispatch({ type: "addLoot", runId: last.id, name, qty: 1 })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (q) void api().dispatch({ type: "addLoot", runId: last.id, name, qty: -1 });
                  }}
                >
                  {name.replace(/ Orb$/, "").replace(/^Orb of /, "").slice(0, 7)}
                  {q > 0 && <b>{q}</b>}
                </button>
              );
            })}
          </div>

          {dropOpen ? (
            <DropForm run={last} onDone={() => setDropOpen(false)} />
          ) : (
            <button className="ov-add" onClick={() => setDropOpen(true)}>
              + Değerli item
            </button>
          )}
          {(last.drops ?? []).length > 0 && (
            <div className="ov-drops">{last.drops!.map((d) => `${d.name} ${fmtDiv(d.valueDiv)}`).join(" · ")}</div>
          )}

          <div className="ov-total">
            {inMap ? "Bu map" : "Son map"}: net <b>{fmtDiv(runNetDiv(last, prices))} div</b>
            {runCostDiv(last, prices) > 0 && <span> (maliyet −{fmtDiv(runCostDiv(last, prices))})</span>}
          </div>
        </>
      )}
      <div className="ov-total">
        Bu saat: {hourRuns.length} map · net <b>{fmtDiv(hourNet)} div</b>
      </div>
      {status.lastClosed && now - status.lastClosed.at < 12_000 && (
        <div className={`ov-toast ${status.lastClosed.warnings.length ? "warn" : ""}`}>
          <span>Önceki map · {status.lastClosed.areaName}</span>
          <b className={status.lastClosed.gainDiv - status.lastClosed.spentDiv >= 0 ? "pos" : "neg"}>
            {status.lastClosed.gainDiv - status.lastClosed.spentDiv >= 0 ? "+" : ""}
            {fmtDiv(status.lastClosed.gainDiv - status.lastClosed.spentDiv)} div
          </b>
          {status.lastClosed.warnings.length > 0 && <small>şüpheli: {status.lastClosed.warnings[0]}</small>}
        </div>
      )}
      {session && (
        <div className="ov-total">
          Oturum {formatDuration(now - session.start)}: <b>{fmtDiv(sessionNetPerHour(session, now) ?? 0)} div/saat</b>
        </div>
      )}
    </div>
  );
}

/** Typing needs keyboard focus, so the overlay takes it only while this form is open. */
function DropForm({ run, onDone }: { run: Run; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api().setOverlayFocus(true);
    const t = setTimeout(() => valueRef.current?.focus(), 50);
    return () => {
      clearTimeout(t);
      api().setOverlayFocus(false);
    };
  }, []);

  const div = Number(value.replace(",", "."));
  const valid = name.trim() !== "" && value.trim() !== "" && Number.isFinite(div) && div >= 0;
  const submit = () => {
    if (!valid) return;
    void api().dispatch({ type: "addDrop", runId: run.id, name: name.trim(), valueDiv: div });
    onDone();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onDone();
  };

  return (
    <div className="ov-form">
      <div className="ov-presets">
        <input ref={valueRef} className="ov-val" inputMode="decimal" placeholder="div" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} />
        {[0.5, 1, 5, 10, 20].map((p) => (
          <button key={p} className={div === p ? "has" : ""} onClick={() => setValue(String(p))}>
            {p}
          </button>
        ))}
      </div>
      <input className="ov-name" placeholder="Mageblood, Headhunter…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} />
      <div className="ov-presets">
        <button className="has" disabled={!valid} onClick={submit}>
          Ekle
        </button>
        <button onClick={onDone}>Vazgeç</button>
      </div>
    </div>
  );
}
