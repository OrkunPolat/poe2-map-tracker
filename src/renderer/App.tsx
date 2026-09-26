import { useState } from "react";
import type { Snapshot } from "../shared/ipc";
import { formatDuration, runValueDiv } from "../shared/stats";
import { liveMapTime } from "../shared/tracker";
import { api, fmtDiv, useNow, useSnapshot } from "./api";
import { LootPanel } from "./components/LootPanel";
import { RunsTable } from "./components/RunsTable";
import { DebugView, SettingsView } from "./components/SettingsView";
import { StatsView } from "./components/StatsView";
import { Screenshots, TabletCard, WaystoneCard } from "./components/Items";

const TABS = [
  ["track", "Takip"],
  ["runs", "Geçmiş"],
  ["stats", "İstatistik"],
  ["settings", "Ayarlar"],
  ["debug", "Debug"],
] as const;
type Tab = (typeof TABS)[number][0];

const LOCATION_LABEL = { map: "Map", hideout: "Hideout", town: "Kasaba", other: "Diğer", unknown: "Bilinmiyor" };

export function App() {
  const snap = useSnapshot();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("track");
  if (!snap) return <div className="loading">Yükleniyor…</div>;
  const { state, prices, status, settings } = snap;

  return (
    <div className="app">
      <header>
        <div className="brand">PoE2 Map Tracker</div>
        <nav>
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="status">
          <span className={`dot ${status.logFound ? "ok" : "bad"}`} title={status.logPath}>
            Log
          </span>
          <span>
            {LOCATION_LABEL[state.location.kind]}
            {state.location.kind === "map" && `: ${state.location.areaName}`}
          </span>
          <span className={prices ? "" : "warn"}>
            {prices ? `${prices.league} · 1 div = ${Math.round(prices.exPerDiv ?? 0)} ex` : status.priceError ? "Fiyat hatası" : "Fiyat yok"}
          </span>
        </div>
      </header>

      {!status.logFound && (
        <div className="banner">
          Client.txt bulunamadı. Map takibi için <button onClick={() => setTab("settings")}>Ayarlar</button>'dan log dosyasını seç.
        </div>
      )}

      <main>
        {tab === "track" && <TrackView snap={snap} now={now} />}
        {tab === "runs" && <RunsTable state={state} prices={prices} favorites={settings.favoriteCurrencies} now={now} />}
        {tab === "stats" && <StatsView runs={state.runs} prices={prices} />}
        {tab === "settings" && <SettingsView snap={snap} />}
        {tab === "debug" && <DebugView snap={snap} />}
      </main>
    </div>
  );
}

function TrackView({ snap, now }: { snap: Snapshot; now: number }) {
  const { state, prices, settings } = snap;
  const { pending } = state;
  const current = state.runs.find((r) => r.id === state.activeRunId) ?? state.runs[state.runs.length - 1];
  const todayStart = new Date(new Date(now).toDateString()).getTime();
  const today = state.runs.filter((r) => r.startedAt >= todayStart);
  const todayDiv = today.reduce((s, r) => s + runValueDiv(r, prices), 0);

  return (
    <div className="track">
      <section className="card">
        <div className="card-head">
          <h2>Sonraki map hazırlığı</h2>
          <div className="row">
            {current && current.tablets.length > 0 && pending.tablets.length === 0 && (
              <button onClick={() => void api().dispatch({ type: "reuseTablets", runId: current.id })}>Son tabletleri kullan</button>
            )}
            {(pending.waystone || pending.tablets.length > 0) && (
              <button onClick={() => void api().dispatch({ type: "clearPending" })}>Temizle</button>
            )}
          </div>
        </div>
        <p className="hint">
          Oyunda waystone ve tabletlerin üstüne gelip <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> yap (ya da <kbd>Ctrl</kbd>+<kbd>C</kbd>). Map'e girdiğinde bu setup o map'e bağlanır.
        </p>
        <h4>Waystone</h4>
        {pending.waystone ? <WaystoneCard w={pending.waystone} /> : <p className="muted">Henüz kopyalanmadı</p>}
        <h4>Tabletler ({pending.tablets.length})</h4>
        {pending.tablets.length === 0 && <p className="muted">Henüz kopyalanmadı</p>}
        {pending.tablets.map((t, i) => (
          <TabletCard key={i} t={t} onRemove={() => void api().dispatch({ type: "removePendingTablet", index: i })} />
        ))}
        <Screenshots files={pending.screenshots} />
      </section>

      <section className="card">
        {current ? (
          <>
            <div className="card-head">
              <h2>
                {current.id === state.activeRunId ? "Aktif map" : "Son map"}: {current.areaName}
                <span className="muted"> · lvl {current.areaLevel ?? "?"}</span>
              </h2>
              {current.id === state.activeRunId && (
                <button onClick={() => void api().dispatch({ type: "finishRun" })} title="Aynı map'e tekrar girilmeyecekse">
                  Map'i bitir
                </button>
              )}
            </div>
            <div className="kpis">
              <div>
                <span>Süre</span>
                <b>{formatDuration(liveMapTime(state, current, now))}</b>
              </div>
              <div>
                <span>Ölüm</span>
                <b>{current.deaths}</b>
              </div>
              <div>
                <span>Waystone</span>
                <b>{current.waystone ? `T${current.waystone.stats.tier ?? "?"}` : "–"}</b>
              </div>
              <div>
                <span>Tablet</span>
                <b>{current.tablets.map((t) => t.type).join(", ") || "–"}</b>
              </div>
            </div>
            <LootPanel run={current} favorites={settings.favoriteCurrencies} prices={prices} />
          </>
        ) : (
          <p className="empty">Map'e girdiğinde burada süre, ölüm ve loot girişi görünür.</p>
        )}
        <div className="today">
          Bugün: <b>{today.length}</b> map · <b>{fmtDiv(todayDiv)} div</b>
          {today.length > 0 && <span className="muted"> · ortalama {fmtDiv(todayDiv / today.length)} div/map</span>}
        </div>
      </section>
    </div>
  );
}
