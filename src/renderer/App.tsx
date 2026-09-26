import { useState } from "react";
import type { Snapshot } from "../shared/ipc";
import { formatDuration, hourKeyAt, runCostDiv, runNetDiv, runValueDiv, tabletSetupKey } from "../shared/stats";
import { currentSession, groupSessions, sessionNetPerHour } from "../shared/sessions";
import { liveMapTime } from "../shared/tracker";
import { api, fmtDiv, useNow, useSnapshot } from "./api";
import { CostEditor } from "./components/CostEditor";
import { LootPanel } from "./components/LootPanel";
import { RunsTable } from "./components/RunsTable";
import { DebugView, SettingsView } from "./components/SettingsView";
import { StashView } from "./components/StashView";
import { WaystoneView } from "./components/WaystoneView";
import { dangerLines } from "./danger";
import { Onboarding } from "./components/Onboarding";
import { StatsView } from "./components/StatsView";
import { Screenshots, TabletCard, WaystoneCard } from "./components/Items";

const TABS = [
  ["track", "Takip"],
  ["runs", "Geçmiş"],
  ["stats", "İstatistik"],
  ["stash", "Stash"],
  ["waystone", "Waystone"],
  ["settings", "Ayarlar"],
  ["debug", "Debug"],
] as const;
type Tab = (typeof TABS)[number][0];

const LOCATION_LABEL = { map: "Map", hideout: "Hideout", town: "Kasaba", other: "Diğer", unknown: "Bilinmiyor" };

export function App() {
  const snap = useSnapshot();
  const now = useNow();
  // "#tab=runs" opens a specific tab (used by preview screenshots).
  const [wizard, setWizard] = useState<boolean | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(() => (TABS.find(([id]) => location.hash.split(":")[0] === `#tab=${id}`)?.[0] ?? "track"));
  if (!snap) return <div className="loading">Yükleniyor…</div>;
  const { state, prices, status, settings } = snap;
  // First launch opens the setup wizard once; Settings can reopen it.
  const showWizard = wizard ?? ((!settings.onboarded && !location.hash.includes("tab=")) || location.hash.includes("wizard="));

  return (
    <div className="app">
      {showWizard && <Onboarding snap={snap} onClose={() => setWizard(false)} />}
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

      {status.update && (
        <div className="banner update">
          Yeni sürüm <b>v{status.update.version}</b> hazır (şu an v{status.version}).
          {status.updateProgress != null ? (
            <span> İndiriliyor… %{Math.round(status.updateProgress * 100)}</span>
          ) : (
            <button className="primary" onClick={() => void api().installUpdate()}>
              {status.update.mode === "manual" ? "İndirme sayfasını aç" : "Güncelle ve yeniden başlat"}
            </button>
          )}
          {status.updateError && <span className="warn"> {status.updateError}</span>}
        </div>
      )}
      {!status.logFound && (
        <div className="banner">
          Client.txt bulunamadı. Map takibi için <button onClick={() => setTab("settings")}>Ayarlar</button>'dan log dosyasını seç.
        </div>
      )}

      <main>
        {tab === "track" && <TrackView snap={snap} now={now} />}
        {tab === "runs" && <RunsTable state={state} prices={prices} favorites={settings.favoriteCurrencies} now={now} />}
        {tab === "stats" && <StatsView runs={state.runs} prices={prices} gapMin={settings.sessionGapMin} />}
        {tab === "stash" && <StashView snap={snap} />}
        {tab === "waystone" && <WaystoneView snap={snap} />}
        {tab === "settings" && <SettingsView snap={snap} onWizard={() => setWizard(true)} />}
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
  const todayNet = today.reduce((s, r) => s + runNetDiv(r, prices), 0);
  const thisHour = state.runs.filter((r) => hourKeyAt(r.startedAt) === hourKeyAt(now));
  const hourNet = thisHour.reduce((s, r) => s + runNetDiv(r, prices), 0);
  const gapMs = settings.sessionGapMin * 60_000;
  const session = currentSession(groupSessions(state.runs, gapMs, prices), now, gapMs, !!state.activeRunId);

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
        {pending.waystone ? <WaystoneCard w={pending.waystone} danger={dangerLines(snap, pending.waystone)} /> : <p className="muted">Henüz kopyalanmadı</p>}
        <h4>Tabletler ({pending.tablets.length})</h4>
        {pending.tablets.length === 0 && <p className="muted">Henüz kopyalanmadı</p>}
        {pending.tablets.map((t, i) => (
          <TabletCard key={i} t={t} onRemove={() => void api().dispatch({ type: "removePendingTablet", index: i })} />
        ))}
        {pending.tablets.length > 0 && <TabletCostForm count={pending.tablets.length} defaultUses={settings.defaultTabletUses} />}
        <CostEditor costs={pending.costs ?? []} tabletTypes={pending.tablets.map((t) => t.type)} prices={prices} settings={settings} />
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
                <span>Maliyet</span>
                <b>{runCostDiv(current) ? fmtDiv(runCostDiv(current)) : "–"}</b>
              </div>
              <div>
                <span>Net</span>
                <b className={runNetDiv(current, prices) < 0 ? "warn" : "gold"}>{fmtDiv(runNetDiv(current, prices))}</b>
              </div>
            </div>
            <p className="muted setup-line">
              {current.waystone ? `T${current.waystone.stats.tier ?? "?"} waystone` : "Waystone kaydı yok"} ·{" "}
              {current.tablets.length ? tabletSetupKey(current) : "tabletsiz"}
            </p>
            <LootPanel run={current} favorites={settings.favoriteCurrencies} prices={prices} />
          </>
        ) : (
          <p className="empty">Map'e girdiğinde burada süre, ölüm ve loot girişi görünür.</p>
        )}
        <div className="today">
          {session && (
            <div>
              Oturum: <b>{formatDuration(now - session.start)}</b> · {session.runs.length} map · net <b>{fmtDiv(session.netDiv)} div</b> ·{" "}
              <b className="gold">{fmtDiv(sessionNetPerHour(session, now) ?? 0)} div/saat</b> <span className="muted">(gerçek)</span>
            </div>
          )}
          <div>
            Bu saat ({new Date(now).getHours()}:00): <b>{thisHour.length}</b> map · net <b>{fmtDiv(hourNet)} div</b>
            {thisHour.length > 0 && <span className="muted"> · ort. {fmtDiv(hourNet / thisHour.length)}/map</span>}
          </div>
          <div>
            Bugün: <b>{today.length}</b> map · loot <b>{fmtDiv(todayDiv)}</b> · net <b>{fmtDiv(todayNet)} div</b>
            {today.length > 0 && <span className="muted"> · ort. {fmtDiv(todayNet / today.length)}/map</span>}
          </div>
        </div>
      </section>
    </div>
  );
}

/** "I bought these 3 tablets for 20 div, 10 uses each" -> cost per map is spread automatically. */
function TabletCostForm({ count, defaultUses }: { count: number; defaultUses: number }) {
  const [total, setTotal] = useState("");
  const [uses, setUses] = useState(String(defaultUses));
  const div = Number(total.replace(",", "."));
  const n = Math.max(1, Math.round(Number(uses) || 0));
  const valid = total.trim() !== "" && Number.isFinite(div) && div >= 0;
  return (
    <div className="cost-form">
      <h4>Tablet maliyeti</h4>
      <div className="row">
        <span>{count} tablet toplam</span>
        <input className="div-input" inputMode="decimal" placeholder="20" value={total} onChange={(e) => setTotal(e.target.value)} />
        <span>div, her biri</span>
        <input className="qty" type="number" min={1} value={uses} onChange={(e) => setUses(e.target.value)} />
        <span>kullanım</span>
        <button
          className="primary"
          disabled={!valid}
          onClick={() => {
            void api().dispatch({ type: "setPendingTabletsCost", totalDiv: div, usesPerTablet: n });
            setTotal("");
          }}
        >
          Uygula
        </button>
      </div>
      {valid && <p className="hint">Map başına {(div / n).toFixed(2)} div maliyet yazılır.</p>}
    </div>
  );
}
