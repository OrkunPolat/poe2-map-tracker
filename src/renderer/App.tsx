import { useState } from "react";
import type { Snapshot } from "../shared/ipc";
import { currentSession, groupSessions, sessionNetPerHour } from "../shared/sessions";
import { formatDuration, runCostDiv, runNetDiv, runValueDiv, tabletSetupKey } from "../shared/stats";
import { liveMapTime } from "../shared/tracker";
import type { Run } from "../shared/types";
import { api, exPerChaos, fmtDiv, fmtEx, fmtValue, useNow, useSnapshot } from "./api";
import { dangerLines } from "./danger";
import { ALL_LEAGUES, inLeague, leaguesOf } from "./league";
import { counted } from "../shared/stats";
import { stashLootTotals, stashLootWarnings } from "../shared/stashDiff";
import { CostEditor } from "./components/CostEditor";
import { DayTimeline } from "./components/DayTimeline";
import { Icon } from "./components/Icons";
import { Screenshots, TabletCard, WaystoneCard } from "./components/Items";
import { LootPanel } from "./components/LootPanel";
import { Onboarding } from "./components/Onboarding";
import { RunsTable } from "./components/RunsTable";
import { SettingsView } from "./components/SettingsView";
import { StashView } from "./components/StashView";
import { StatsView } from "./components/StatsView";
import { GFN_FARMS } from "../shared/gfn";

const PAGES = [
  ["track", "Map", "map"],
  ["history", "Geçmiş", "history"],
  ["stats", "Analiz", "chart"],
  ["stash", "Stash", "box"],
  ["settings", "Ayarlar", "settings"],
] as const;
type Page = (typeof PAGES)[number][0];

const LOCATION_LABEL = { map: "Map'te", hideout: "Hideout'ta", town: "Kasabada", other: "Başka bölgede", unknown: "Bilinmiyor" };

export function App() {
  const snap = useSnapshot();
  const now = useNow();
  const [wizard, setWizard] = useState<boolean | undefined>(undefined);
  const [league, setLeague] = useState<string>();
  // "#tab=stats:farm" opens a page (and sub view) directly; used for preview screenshots.
  const [page, setPage] = useState<Page>(() => {
    const id = /tab=(\w+)/.exec(location.hash)?.[1];
    const legacy: Record<string, Page> = { runs: "history", waystone: "settings", debug: "settings" };
    return (PAGES.find(([p]) => p === id)?.[0] ?? legacy[id ?? ""] ?? "track") as Page;
  });
  if (!snap) return <div className="loading">Yükleniyor…</div>;
  const { state, prices, status, settings } = snap;
  const showWizard = wizard ?? ((!settings.onboarded && !location.hash.includes("tab=")) || location.hash.includes("wizard="));
  // Geçmiş and Analiz show the current league unless another one (or all) is picked.
  const shownLeague = league ?? settings.league;
  const leagueRuns = inLeague(state.runs, shownLeague, settings.league);
  const leaguePicker = (
    <select className="league-select" value={shownLeague} onChange={(e) => setLeague(e.target.value)}>
      {leaguesOf(state.runs, settings.league).map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
      <option value={ALL_LEAGUES}>Tüm ligler</option>
    </select>
  );

  return (
    <div className="app">
      {showWizard && <Onboarding snap={snap} onClose={() => setWizard(false)} />}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="sparkle" size={16} />
          </span>
          <div>
            <b>Map Tracker</b>
            <small>Path of Exile 2</small>
          </div>
        </div>
        <nav>
          {PAGES.map(([id, label, icon]) => (
            <button key={id} className={page === id ? "on" : ""} onClick={() => setPage(id)}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {status.update && (
            <button className="update-pill" onClick={() => void api().installUpdate()} disabled={status.updateProgress != null}>
              <Icon name="download" size={15} />
              {status.updateProgress != null ? `İndiriliyor %${Math.round(status.updateProgress * 100)}` : `v${status.update.version} yükle`}
            </button>
          )}
          <div className="side-status">
            <span className={`dot ${settings.playMode === "gfn" || status.logFound ? "ok" : "bad"}`} />
            {settings.playMode === "gfn" ? `GeForce Now · ${LOCATION_LABEL[state.location.kind]}` : status.logFound ? LOCATION_LABEL[state.location.kind] : "Log bulunamadı"}
          </div>
          <div className="side-status muted">{prices ? `${prices.league} · 1 div = ${Math.round(prices.exPerDiv ?? 0)} ex${exPerChaos(prices) ? ` · 1 c = ${exPerChaos(prices)} ex` : ""}` : "Fiyat yok"}</div>
          <div className="side-status muted">v{status.version}</div>
        </div>
      </aside>

      <main>
        {!status.logFound && settings.playMode !== "gfn" && (
          <div className="callout warn">
            <Icon name="alert" size={16} /> Client.txt bulunamadı; map takibi çalışmaz.
            <button onClick={() => setPage("settings")}>Ayarlar'da seç</button>
          </div>
        )}
        {status.updateError && <div className="callout warn">Güncelleme hatası: {status.updateError}</div>}
        {status.newLeague && (
          <div className="callout">
            Yeni lig başladı: <b>{status.newLeague}</b>. Fiyatlar, stash okuma ve yeni map'ler bu lige geçsin mi?
            <button className="primary" onClick={() => void api().answerNewLeague(true)}>
              Geç
            </button>
            <button onClick={() => void api().answerNewLeague(false)}>{settings.league}'de kal</button>
          </div>
        )}
        {page === "track" && <TrackView snap={snap} now={now} />}
        {page === "history" && <HistoryView snap={snap} now={now} runs={leagueRuns} leaguePicker={leaguePicker} />}
        {page === "stats" && <StatsView runs={counted(leagueRuns)} prices={prices} gapMin={settings.sessionGapMin} leaguePicker={leaguePicker} />}
        {page === "stash" && <StashView snap={snap} onSetup={() => setPage("settings")} />}
        {page === "settings" && <SettingsView snap={snap} onWizard={() => setWizard(true)} />}
      </main>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <div className="row">{children}</div>
    </div>
  );
}

function HistoryView({ snap, now, runs, leaguePicker }: { snap: Snapshot; now: number; runs: Run[]; leaguePicker: React.ReactNode }) {
  const [view, setView] = useState<"list" | "day">(() => (location.hash.includes(":day") ? "day" : "list"));
  return (
    <>
      <PageHead title="Geçmiş" sub={`${runs.length} map kayıtlı`}>
        {leaguePicker}
        <div className="seg">
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            Liste
          </button>
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>
            Gün
          </button>
        </div>
      </PageHead>
      {view === "list" ? (
        <RunsTable state={{ ...snap.state, runs }} prices={snap.prices} favorites={snap.settings.favoriteCurrencies} now={now} snap={snap} />
      ) : (
        <DayTimeline runs={counted(runs)} prices={snap.prices} />
      )}
    </>
  );
}

function TrackView({ snap, now }: { snap: Snapshot; now: number }) {
  const { state, prices, settings } = snap;
  const { pending } = state;
  const active = state.runs.find((r) => r.id === state.activeRunId);
  const current = active ?? state.runs[state.runs.length - 1];
  const gapMs = settings.sessionGapMin * 60_000;
  const liveRuns = counted(inLeague(state.runs, settings.league, settings.league));
  const session = currentSession(groupSessions(liveRuns, gapMs, prices), now, gapMs, active?.id);
  const auto = settings.autoStash && !!settings.tradeAccount;
  // The map before the current one is where the automatic loot shows up once it is closed.
  const idx = current ? state.runs.findIndex((r) => r.id === current.id) : -1;
  const previous = idx > 0 ? state.runs[idx - 1] : undefined;

  return (
    <>
      <PageHead
        title={active ? active.areaName : "Hideout"}
        sub={
          active
            ? `${active.areaLevel ? `lvl ${active.areaLevel} · ` : ""}${active.tablets.length ? tabletSetupKey(active) : "tabletsiz"}`
            : settings.playMode === "gfn"
              ? "Map'e girince Yeni map'e bas"
              : "Sıradaki map'i hazırla"
        }
      >
        {settings.playMode === "gfn" ? (
          <>
            <button className="primary" onClick={() => void api().gfnStart()}>
              <Icon name="plus" size={15} /> Yeni map
            </button>
            {active && <button onClick={() => void api().gfnEnd()}>Map bitti</button>}
          </>
        ) : (
          active && (
            <button onClick={() => void api().dispatch({ type: "finishRun" })} title="Aynı map'e tekrar girilmeyecekse">
              Map'i bitir
            </button>
          )
        )}
      </PageHead>

      {session && (
        <div className="stat-strip">
          <Stat label="Oturum" value={formatDuration(now - session.start)} sub={`${session.runs.length} map`} />
          <Stat label="Oturum net" value={`${fmtDiv(session.netDiv)} div`} sub={fmtEx(session.netDiv, prices?.exPerDiv)} tone={session.netDiv >= 0 ? "pos" : "neg"} />
          <Stat label="Gerçek saatlik" value={`${fmtDiv(sessionNetPerHour(session, now) ?? 0)} div`} sub="hideout dahil" accent />
          <Stat label="Map başına" value={`${fmtDiv(session.netDiv / session.runs.length)} div`} sub="ortalama net" />
        </div>
      )}

      <div className="track">
        <section className="card">
          {current ? (
            <>
              <div className="card-head">
                <h2>{active ? "Bu map" : `Son map · ${current.areaName}`}</h2>
                <span className="muted">{current.waystone ? `T${current.waystone.stats.tier ?? "?"} waystone` : ""}</span>
              </div>
              <div className="kpis">
                <Stat label="Süre" value={formatDuration(liveMapTime(state, current, now))} />
                <Stat label="Ölüm" value={String(current.deaths)} tone={current.deaths ? "neg" : undefined} />
                <Stat label="Loot" value={fmtDiv(runValueDiv(current, prices))} />
                <Stat
                  label="Net"
                  value={fmtDiv(runNetDiv(current, prices))}
                  tone={runNetDiv(current, prices) >= 0 ? "pos" : "neg"}
                  sub={runCostDiv(current, prices) ? `maliyet ${fmtDiv(runCostDiv(current, prices))}` : undefined}
                />
              </div>

              {auto && <AutoLootStatus snap={snap} now={now} current={current} previous={previous} />}

              {auto ? (
                <details className="fold">
                  <summary>Elle ekle (stash'e koymadıkların, unique'ler)</summary>
                  <LootPanel run={current} favorites={settings.favoriteCurrencies} prices={prices} />
                </details>
              ) : (
                <>
                  <LootPanel run={current} favorites={settings.favoriteCurrencies} prices={prices} />
                  <p className="hint">Ayarlar → Stash'te hesap adını girersen loot'u elle girmen gerekmez; her map'in kazancı stash farkından otomatik hesaplanır.</p>
                </>
              )}
            </>
          ) : (
            <div className="empty">Map'e girdiğinde süre, ölüm ve kazanç burada görünür.</div>
          )}
        </section>

        {settings.playMode === "gfn" ? (
          <GfnCard snap={snap} />
        ) : (
        <section className="card">
          <div className="card-head">
            <h2>Sıradaki map</h2>
            <div className="row">
              {current && current.tablets.length > 0 && pending.tablets.length === 0 && (
                <button onClick={() => void api().dispatch({ type: "reuseTablets", runId: current.id })}>Son tabletler</button>
              )}
              {(pending.waystone || pending.tablets.length > 0) && <button onClick={() => void api().dispatch({ type: "clearPending" })}>Temizle</button>}
            </div>
          </div>
          <p className="hint">
            Waystone ve tabletlerin üstünde <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>. Map'e girince bu setup o map'e bağlanır.
          </p>
          <div className="label">Waystone</div>
          {pending.waystone ? <WaystoneCard w={pending.waystone} danger={dangerLines(snap, pending.waystone)} /> : <div className="placeholder">Kopyalanmadı</div>}
          <div className="label">Tabletler · {pending.tablets.length}</div>
          {pending.tablets.length === 0 && <div className="placeholder">Kopyalanmadı</div>}
          {pending.tablets.map((t, i) => (
            <TabletCard key={i} t={t} compact onRemove={() => void api().dispatch({ type: "removePendingTablet", index: i })} />
          ))}
          <details className="fold">
            <summary>Maliyetler (tablet fiyatı, juice)</summary>
            {pending.tablets.length > 0 && <TabletCostForm count={pending.tablets.length} defaultUses={settings.defaultTabletUses} />}
            <CostEditor costs={pending.costs ?? []} tabletTypes={pending.tablets.map((t) => t.type)} prices={prices} settings={settings} />
          </details>
          <Screenshots files={pending.screenshots} />
        </section>
        )}
      </div>
    </>
  );
}

/** GeForce Now: no log or clipboard in the cloud, so the map is started by hand; loot still comes from the stash. */
function GfnCard({ snap }: { snap: Snapshot }) {
  const { settings, status } = snap;
  const [name, setName] = useState(settings.gfnMapName);
  const set = (p: Partial<typeof settings>) => void api().setSettings(p);
  return (
    <section className="card">
      <div className="card-head">
        <h2>GeForce Now modu</h2>
        <span className={`pill ${status.gfnHotkeysRegistered ? "ok" : "warn"}`}>{status.gfnHotkeysRegistered ? "kısayollar aktif" : "kısayol kayıtlı değil"}</span>
      </div>
      <p className="hint">
        Her map'e girerken <kbd>{shortcutLabel(settings.gfnStartHotkey)}</kbd>, hideout'a dönünce <kbd>{shortcutLabel(settings.gfnEndHotkey)}</kbd> bas (ya da overlay'deki
        butonlar). Kazanç stash farkından otomatik hesaplanır.
      </p>
      <div className="label">Farm</div>
      <div className="seg">
        {GFN_FARMS.map((f) => (
          <button key={f} className={settings.gfnFarm === f ? "on" : ""} onClick={() => set({ gfnFarm: f })}>
            {f}
          </button>
        ))}
      </div>
      <div className="label">Tablet sayısı</div>
      <div className="seg">
        {[0, 3, 4].map((n) => (
          <button key={n} className={settings.gfnTabletCount === n ? "on" : ""} onClick={() => set({ gfnTabletCount: n })}>
            {n === 0 ? "Tabletsiz" : `${n} tablet`}
          </button>
        ))}
      </div>
      <div className="label">Map adı (isteğe bağlı)</div>
      <input value={name} placeholder={`${settings.gfnFarm} map`} onChange={(e) => setName(e.target.value)} onBlur={() => set({ gfnMapName: name })} />
      {!settings.tradeAccount && <p className="warn">Kazancın otomatik hesaplanması için Ayarlar → Stash'te hesap adını gir.</p>}
    </section>
  );
}

/** "CommandOrControl+Shift+N" -> "⌘⇧N" on Mac, "Ctrl+Shift+N" elsewhere. */
export function shortcutLabel(acc: string): string {
  const mac = navigator.platform.toLowerCase().includes("mac");
  if (!mac) return acc.replace("CommandOrControl", "Ctrl").replace("CmdOrCtrl", "Ctrl");
  return acc
    .replace(/CommandOrControl|CmdOrCtrl|Command|Cmd/g, "⌘")
    .replace(/Control|Ctrl/g, "⌃")
    .replace(/Shift/g, "⇧")
    .replace(/Alt|Option/g, "⌥")
    .replace(/\+/g, "");
}

/** Where the automatic stash diff stands for this map, and what the previous map brought in. */
function AutoLootStatus({ snap, now, current, previous }: { snap: Snapshot; now: number; current: Run; previous?: Run }) {
  const { status, prices, state } = snap;
  const a = status.autoStash?.runId === current.id ? status.autoStash : undefined;
  const inMap = current.id === state.activeRunId && state.location.kind === "map";
  const shown = current.stashLoot ? current : previous?.stashLoot ? previous : undefined;
  return (
    <div className="auto-loot">
      {readFailing(status) && (
        <div className="suspect">
          <Icon name="alert" size={14} />
          <span>Stash okunamıyor: {status.stashHealth!.lastError}. Bu sırada biten map'lerin kazancı hesaplanamaz.</span>
        </div>
      )}
      <div className="auto-head">
        <Icon name="refresh" size={15} />
        {current.stashLoot
          ? "Bu map'in kazancı stash farkından hesaplandı."
          : a?.beforeAt
            ? `Girişte stash okundu (${fmtDiv(a.beforeDiv ?? 0)} div). Kazanç sonraki map'e girince ya da hideout'ta 4 dk bekleyince hesaplanır.`
            : a?.dueAt && inMap
              ? `Stash ${Math.max(0, Math.ceil((a.dueAt - now) / 1000))} sn sonra okunacak.`
              : status.stashBusy
                ? "Stash okunuyor…"
                : "Map'e girince stash otomatik okunur."}
      </div>
      {shown?.stashLoot && <StashDiff run={shown} snap={snap} title={shown.id === current.id ? "Bu map" : `Önceki map · ${shown.areaName}`} limit={10} />}
    </div>
  );
}

/** A map's stash diff: warnings, lines (click to leave one out), and a switch to exclude the map. */
export function StashDiff({ run, snap, title, limit }: { run: Run; snap: Snapshot; title?: string; limit?: number }) {
  const { prices } = snap;
  if (!run.stashLoot) return null;
  const { gainDiv, spentDiv } = stashLootTotals(run, prices);
  const gains = snap.state.runs.filter((r) => r.stashLoot && r.id !== run.id).map((r) => stashLootTotals(r, prices).gainDiv).sort((a, b) => a - b);
  const warnings = stashLootWarnings(run, prices, gains.length ? gains[Math.floor(gains.length / 2)]! : 0);
  const ignored = new Set(run.stashLoot.ignored ?? []);
  const items = limit ? run.stashLoot.items.slice(0, limit) : run.stashLoot.items;
  return (
    <div className="stash-diff">
      <div className="label">
        {title && <>{title} </>}
        <span className="pos">+{fmtDiv(gainDiv)} div</span>
        {spentDiv > 0 && <span className="neg"> · harcanan {fmtDiv(spentDiv)} div</span>}
      </div>
      {warnings.length > 0 && (
        <div className="suspect">
          <Icon name="alert" size={14} />
          <span>
            Şüpheli: {warnings.join(" · ")}. Trade/craft satırlarına tıklayıp hesaptan çıkar ya da map'i tamamen hariç tut.
          </span>
        </div>
      )}
      {run.stashLoot.items.length === 0 ? (
        <div className="placeholder">Stash'te değişiklik yok</div>
      ) : (
        <table className="loot-table diff-table">
          <tbody>
            {items.map((it) => {
              const u = it.unitDiv ?? prices?.divByName[it.name];
              const off = ignored.has(it.name);
              return (
                <tr
                  key={it.name}
                  className={off ? "ignored" : ""}
                  title={off ? "Hesaba kat" : "Bu satırı hesaptan çıkar"}
                  onClick={() => void api().dispatch({ type: "toggleStashLootItem", runId: run.id, name: it.name })}
                >
                  <td>{it.name}</td>
                  <td className={`num ${it.qty > 0 ? "pos" : "neg"}`}>
                    {it.qty > 0 ? "+" : ""}
                    {it.qty}
                  </td>
                  <td className="num muted">{u != null ? fmtValue(Math.abs(it.qty) * u, prices?.exPerDiv) : <span className="warn">fiyat yok</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <label className="toggle small-toggle">
        <input type="checkbox" checked={!!run.excluded} onChange={(e) => void api().dispatch({ type: "setExcluded", runId: run.id, excluded: e.target.checked })} />
        <span className="switch" />
        <span>Bu map'i istatistiklere katma</span>
      </label>
    </div>
  );
}

/** The last trade read failed and nothing has worked since. */
export function readFailing(status: Snapshot["status"]): boolean {
  const h = status.stashHealth;
  return !!h?.lastErrorAt && (!h.lastOkAt || h.lastErrorAt > h.lastOkAt);
}

export function Stat({ label, value, sub, tone, accent }: { label: string; value: string; sub?: string; tone?: "pos" | "neg"; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <b className={tone ?? ""}>{value}</b>
      {sub && <small>{sub}</small>}
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
    <div className="sub-block">
      <div className="label">Tablet fiyatı</div>
      <div className="row">
        <span>{count} tablet toplam</span>
        <input className="div-input" inputMode="decimal" placeholder="20" value={total} onChange={(e) => setTotal(e.target.value)} />
        <span>div · her biri</span>
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
