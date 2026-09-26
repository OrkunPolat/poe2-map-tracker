import { useEffect, useRef } from "react";
import { formatDuration, runValueDiv } from "../shared/stats";
import { liveMapTime } from "../shared/tracker";
import { api, fmtDiv, useNow, useSnapshot } from "./api";

/** Compact always-on-top panel shown over the game (top-right by default). */
export function Overlay() {
  const snap = useSnapshot();
  const now = useNow();
  const ref = useRef<HTMLDivElement>(null);

  // Size the frameless window to whatever the panel currently needs.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => api().resizeOverlay(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [snap === undefined]);

  if (!snap) return null;
  const { state, prices, settings } = snap;
  const active = state.runs.find((r) => r.id === state.activeRunId);
  const last = active ?? state.runs[state.runs.length - 1];
  const inMap = state.location.kind === "map" && !!active;
  const { pending } = state;
  const quick = settings.favoriteCurrencies.slice(0, 4);
  const total = last ? runValueDiv(last, prices) : 0;

  return (
    <div className="ov" ref={ref}>
      <div className="ov-head">
        <span className={`ov-dot ${inMap ? "live" : ""}`} />
        <span className="ov-title">{inMap ? active!.areaName : state.location.kind === "hideout" ? "Hideout" : "PoE2 Tracker"}</span>
        {inMap && (
          <span className="ov-meta">
            lvl {active!.areaLevel} · {formatDuration(liveMapTime(state, active!, now))}
            {active!.deaths > 0 && <span className="ov-death"> · {active!.deaths} ölüm</span>}
          </span>
        )}
        <button className="ov-btn" title="Ana pencereyi aç" onClick={() => api().showMain()}>
          ⤢
        </button>
      </div>

      {inMap ? (
        <div className="ov-line">
          {active!.waystone ? `T${active!.waystone.stats.tier ?? "?"}` : "Waystone yok"}
          {active!.waystone?.stats.itemRarity != null && ` · R ${active!.waystone.stats.itemRarity}%`}
          {active!.waystone?.stats.packSize != null && ` · P ${active!.waystone.stats.packSize}%`}
          {" · "}
          {active!.tablets.map((t) => t.type).join(", ") || "tabletsiz"}
        </div>
      ) : (
        <div className="ov-line">
          Hazır: {pending.waystone ? `T${pending.waystone.stats.tier ?? "?"} waystone` : "waystone yok"} · {pending.tablets.length} tablet
          {pending.tablets.length > 0 && ` (${pending.tablets.map((t) => t.type).join(", ")})`}
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
          <div className="ov-total">
            {inMap ? "Bu map" : `Son map (${last.areaName})`}: <b>{fmtDiv(total)} div</b>
          </div>
        </>
      )}
    </div>
  );
}
