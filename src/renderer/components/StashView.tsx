import { Fragment, useState } from "react";
import { filterStash, itemVisible, minItemDiv, stashValueDiv, tabValueDiv } from "../../shared/stash";
import type { Snapshot } from "../../shared/ipc";
import type { CurrencyUnit, PriceTable, Settings, StashTab } from "../../shared/types";
import { DEFAULT_SLOW_PRICES } from "../../shared/tradeStash";
import { api, exPerChaos, fmtDiv, fmtEx, fmtValue } from "../api";
import { TabCheckList } from "./Onboarding";
import { Trend } from "./Trend";
import { sellHints } from "../../shared/trends";
import { PageHead } from "../App";
import { Icon } from "./Icons";
import { tabPrice } from "../../shared/tradeStash";
import { UnpricedCard } from "./Unpriced";
import { Collapsible } from "./Collapsible";
import { ItemDetail, fmtCompact } from "./ItemDetail";
import { hourlyUnits } from "../../shared/trends";

/** Special tabs worth reading (Map, Gem and Unique tabs are left out on purpose). */
const EXPECTED = ["Currency", "Essences", "Abyss", "Ritual", "Delirium", "Breach", "Expedition", "Fragments", "Runes", "SoulCores", "Idols"];

const ago = (ts: number, now: number) => {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} saat önce` : `${Math.round(h / 24)} gün önce`;
};

export function StashView({ snap, onSetup }: { snap: Snapshot; onSetup: () => void }) {
  const { stash, prices, status, settings, now } = snap;
  const minDiv = minItemDiv(settings, prices);
  const total = stashValueDiv(stash, prices, minDiv);
  const last = stash.history[stash.history.length - 1];
  const prev = stash.history[stash.history.length - 2];
  // With trade sync the placeholders are noise: the user decides which tabs are public.
  const missing = settings.tradeAccount ? [] : EXPECTED.filter((c) => !stash.tabs.some((t) => t.category === c));

  return (
    <div className="stash">
      <PageHead title="Stash" sub={settings.tradeAccount ? `${settings.tradeAccount} · public sekmeler` : "Hesap bağlı değil"}>
        <button className="primary" disabled={status.stashBusy} onClick={() => void api().stashRefresh()}>
          <Icon name="refresh" size={15} /> {status.stashBusy ? "Okunuyor…" : "Yenile"}
        </button>
      </PageHead>

      {!settings.tradeAccount && (
        <div className="callout">
          Stash'ini otomatik okumak için hesap adını gir ve sekmelerini hazırla.
          <button onClick={onSetup}>Ayarlar → Stash</button>
        </div>
      )}

      <div className="stat-strip">
        <div className="stat accent">
          <span>Stash değeri</span>
          <b>{fmtDiv(total)} div</b>
          <small>{fmtEx(total, prices?.exPerDiv)}</small>
        </div>
        <div className="stat">
          <span>Kur</span>
          <b>{prices?.exPerDiv ? `1 div = ${Math.round(prices.exPerDiv)} ex` : "–"}</b>
          <small>{exPerChaos(prices) ? `1 chaos = ${exPerChaos(prices)} ex` : "chaos fiyatı yok"}</small>
        </div>
        <div className="stat">
          <span>Son yenilemeye göre</span>
          <b className={prev && last && last.div < prev.div ? "neg" : "pos"}>
            {prev && last ? `${last.div >= prev.div ? "+" : ""}${fmtDiv(last.div - prev.div)} div` : "–"}
          </b>
          <small>{prev ? ago(prev.ts, now) : "henüz karşılaştırma yok"}</small>
        </div>
        <div className="stat">
          <span>Sekme</span>
          <b>{stash.tabs.length}</b>
          <small>{stash.tabs.reduce((s, t) => s + t.items.filter((i) => itemVisible(i.name, prices, minDiv)).length, 0)} farklı item</small>
        </div>
      </div>

      <StashFilter settings={settings} prices={prices} hidden={stash.tabs.reduce((s, t) => s + t.items.filter((i) => !itemVisible(i.name, prices, minDiv)).length, 0)} />

      {status.stashMessage && (
        <p className={`status-line ${status.stashMessage.ok ? "" : "warn"}`}>
          {status.stashMessage.text} <span className="muted">· {ago(status.stashMessage.at, now)}</span>
        </p>
      )}

      <UnpricedCard snap={snap} />

      <SellHints snap={snap} minDiv={minDiv} />

      {status.tabCheck && status.tabCheck.issues.some((i) => i.kind !== "ok" && i.kind !== "missing") && (
        <section className="card">
          <h3>Sekme kontrolü: düzeltilmesi gerekenler</h3>
          <TabCheckList issues={status.tabCheck.issues.filter((i) => i.kind !== "missing")} />
          <button onClick={() => void api().checkTabSetup()}>Tam kontrol (diğer public sekmeler dahil)</button>
        </section>
      )}


      <div className="stash-grid">
        {[...stash.tabs]
          .sort((a, b) => tabValueDiv(b, prices, minDiv) - tabValueDiv(a, prices, minDiv))
          .map((t) => (
            <TabCard key={t.id} tab={t} prices={prices} now={now} minDiv={minDiv} autoSkip={settings.autoSkipPrices ?? DEFAULT_SLOW_PRICES} />
          ))}
        {missing.map((c) => (
          <section key={c} className="card tab-card empty-tab">
            <h3>{c}</h3>
            <p className="muted">Henüz okunmadı</p>
          </section>
        ))}
      </div>
    </div>
  );
}

function TabCard({ tab, prices, now, minDiv, autoSkip }: { tab: StashTab; prices?: PriceTable; now: number; minDiv: number; autoSkip: number[] }) {
  const value = tabValueDiv(tab, prices, minDiv);
  const shown = tab.items.filter((i) => itemVisible(i.name, prices, minDiv));
  const rows = [...shown].sort(
    (a, b) => (b.qty ?? 0) * (prices?.divByName[b.name] ?? 0) - (a.qty ?? 0) * (prices?.divByName[a.name] ?? 0),
  );
  const unread = tab.items.filter((i) => i.qty == null).length;
  const trade = tab.source === "trade";
  const [open, setOpen] = useState<string>();
  return (
    <section className="card tab-card">
      <div className="card-head">
        <h3>
          {tab.label} <span className={`tag ${trade ? "" : "type"}`}>{trade ? "trade" : "ekran"}</span>
        </h3>
        <b className="gold">{fmtDiv(value)} div</b>
      </div>
      <p className="muted small">
        {ago(tab.capturedAt, now)} · {shown.length} item
        {shown.length < tab.items.length && <span> ({tab.items.length - shown.length} gizli)</span>}
        {unread > 0 && <span className="warn"> · {unread} sayı eksik, elle gir</span>}
        {tab.screenshot && (
          <>
            {" "}·{" "}
            <a href={`shot://img/${encodeURIComponent(tab.screenshot)}`} target="_blank" rel="noreferrer">
              görüntü
            </a>
          </>
        )}
      </p>
      <div className="tab-rows">
      <table className="loot-table fixed">
        <tbody>
          {rows.map((it) => {
            const unit = prices?.divByName[it.name];
            return (
              <Fragment key={it.name}>
              <tr
                className={`clickable ${it.qty == null ? "unread" : ""} ${open === it.name ? "open" : ""}`}
                onClick={() => setOpen(open === it.name ? undefined : it.name)}
              >
                <td className="name-cell" title={it.name}>{it.name}</td>
                <td className="qty-cell">
                  {trade ? (
                    <span className="qty-text">{it.qty ?? "?"}</span>
                  ) : (
                  <input
                    onClick={(e) => e.stopPropagation()}
                    className="qty"
                    disabled={trade}
                    title={trade ? "Trade sitesinden geliyor; Yenile ile güncellenir" : undefined}
                    type="number"
                    min={0}
                    placeholder="?"
                    value={it.qty ?? ""}
                    onChange={(e) =>
                      void api().stashSetQty(tab.id, it.name, e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))
                    }
                  />
                  )}
                </td>
                <td className="num muted unit-cell">{unit != null ? fmtValue(unit, prices?.exPerDiv) : "–"}</td>
                <td className="num trend-cell">
                  <Trend change={prices?.changeByName?.[it.name]} />
                </td>
                <td className="num total-cell">{unit != null && it.qty ? fmtValue(unit * it.qty, prices?.exPerDiv) : ""}</td>
              </tr>
              {open === it.name && (
                <tr className="detail-row">
                  <td colSpan={5}>
                    <ItemDetail name={it.name} qty={it.qty} prices={prices} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      {trade && <AutoReadToggle tab={tab} autoSkip={autoSkip} />}
      <button className="danger" onClick={() => confirm(`${tab.label} sekmesi silinsin mi?`) && void api().stashDeleteTab(tab.id)}>
        Sekmeyi sil
      </button>
    </section>
  );
}

/** Setup for reading public tabs from the trade site (the PoE Overlay method). */
export function TradeSetup({ account }: { account: string }) {
  const [value, setValue] = useState(account);
  const valid = /^.+#\d{4}$/.test(value.trim()) || value.trim() === "";
  return (
    <section className="card how">
      <h3>Trade sitesinden okuma</h3>
      <ol className="steps">
        <li>
          Oyunda okumak istediğin sekmeye sağ tık → <b>Public</b> yap. <span className="warn">Merchant's Tab kullanma</span> (orada item'lar anında satılabilir).
        </li>
        <li>
          Sekmenin adını fiyat + istediğin isim yap: <code>~price 991 divine Expedition</code>, <code>~price 992 divine Ritual</code>,{" "}
          <code>~price 993 divine Abyss</code>… Her sekmeye farklı sayı ver (990-998 arası). Fahiş fiyat item'ların sadece trade sitesinde görünmesini
          sağlar, kimse almaz; sondaki isim uygulamada sekme adı olarak görünür.
        </li>
        <li>Hesap adını <b>İsim#1234</b> şeklinde gir (pathofexile.com profilindeki tam ad) ve <b>⟳ Yenile</b>'ye bas.</li>
      </ol>
      <div className="row">
        <input className="grow" placeholder="Hesap adı, ör. Orkun#1234" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="primary" disabled={!valid || value.trim() === account} onClick={() => void api().setSettings({ tradeAccount: value.trim() })}>
          Kaydet
        </button>
      </div>
      {!valid && <p className="warn">Ad #1234 gibi 4 haneli ekle bitmeli.</p>}
      <p className="hint">
        Trade sitesi değişiklikleri birkaç dakika gecikmeyle görür. Sekmedeki her item okunur. Büyük sekmeler (100+ item, ör. Rune) önce küçükler okunduktan sonra arka planda okunur. Giriş yapılmaz, şifre ya da POESESSID
        istenmez; sadece herkese açık trade verisi okunur ve trade sitesinin istek sınırlarına uyulur.
      </p>
    </section>
  );
}

/** Exiled Tools-style: what in the stash is losing or gaining value this week. */
function SellHints({ snap, minDiv }: { snap: Snapshot; minDiv: number }) {
  const hints = sellHints(filterStash(snap.stash, snap.prices, minDiv), snap.prices);
  const [open, setOpen] = useState<string>();
  if (hints.length === 0) return null;
  const sell = hints.filter((h) => h.advice === "sell").slice(0, 6);
  const hold = hints.filter((h) => h.advice === "hold").slice(0, 6);
  const row = (h: (typeof hints)[number]) => {
    const perHour = hourlyUnits(h.name, snap.prices);
    return (
    <Fragment key={h.name}>
    <tr className={`clickable ${open === h.name ? "open" : ""}`} onClick={() => setOpen(open === h.name ? undefined : h.name)}>
      <td className="name-cell" title={h.name}>{h.name}</td>
      <td className="num">{h.qty}×</td>
      <td className="num" title="Elindeki adetlerin bugünkü değeri">{fmtDiv(h.valueDiv)} div</td>
      <td className="num muted" title="Currency Exchange'de saatte el değiştiren adet (poe.ninja)">{perHour != null ? `${fmtCompact(perHour)}/sa` : "–"}</td>
      <td className="num">
        <Trend change={h.change} />
      </td>
      <td className={`num ${h.impactDiv < 0 ? "warn" : "ok"}`}>
        {h.impactDiv > 0 ? "+" : ""}
        {fmtDiv(h.impactDiv)} div
      </td>
    </tr>
    {open === h.name && (
      <tr className="detail-row">
        <td colSpan={6}>
          <ItemDetail name={h.name} qty={h.qty} prices={snap.prices} />
        </td>
      </tr>
    )}
    </Fragment>
    );
  };
  return (
    <Collapsible id="trends" title="Fiyat trendi (7 gün)" aside="poe.ninja · değeri 1 div üstü ve %10'dan fazla oynayanlar · satıra tıkla: grafik">
      <div className="hint-grid">
        {sell.length > 0 && (
          <div>
            <h4 className="warn">Düşüyor, satmayı düşün</h4>
            <table className="loot-table fixed hint-table">
              <tbody>{sell.map(row)}</tbody>
            </table>
          </div>
        )}
        {hold.length > 0 && (
          <div>
            <h4 className="ok">Yükseliyor, tutmaya değer</h4>
            <table className="loot-table fixed hint-table">
              <tbody>{hold.map(row)}</tbody>
            </table>
          </div>
        )}
      </div>
    </Collapsible>
  );
}

/** Per-tab switch: include this tab in the automatic per-map read (big tabs cost the most requests). */
function AutoReadToggle({ tab, autoSkip }: { tab: StashTab; autoSkip: number[] }) {
  const price = tabPrice(tab.id.replace(/^trade:/, ""));
  if (price == null) return null;
  const skip = new Set(autoSkip);
  const on = !skip.has(price);
  return (
    <label className="toggle small-toggle" title="Kapalıysa bu sekme sadece Yenile'de okunur; büyük, map'te değişmeyen sekmeler için">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          if (e.target.checked) skip.delete(price);
          else skip.add(price);
          void api().setSettings({ autoSkipPrices: [...skip], autoSkipConfigured: true });
        }}
      />
      <span className="switch" />
      <span>Her map'te oku {tab.items.length > 80 && <span className="muted">({tab.items.length} item, yavaş)</span>}</span>
    </label>
  );
}

const UNIT_LABEL: Record<CurrencyUnit, string> = { chaos: "chaos", ex: "ex", div: "div" };

/** Hides cheap items everywhere on this page and leaves them out of the stash value. Kept in local settings. */
function StashFilter({ settings, prices, hidden }: { settings: Settings; prices?: PriceTable; hidden: number }) {
  const f = settings.stashMinValue ?? { amount: 0, unit: "chaos" as CurrencyUnit };
  const [amount, setAmount] = useState(f.amount ? String(f.amount) : "");
  const save = (next: { amount: number; unit: CurrencyUnit }) => void api().setSettings({ stashMinValue: next });
  const missingPrice = f.amount > 0 && f.unit !== "div" && minItemDiv(settings, prices) === 0;
  return (
    <div className="stash-filter">
      <span className="muted">Birim fiyatı</span>
      <input
        className="qty"
        type="number"
        min={0}
        step="any"
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => save({ amount: Math.max(0, Number(amount) || 0), unit: f.unit })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <select value={f.unit} onChange={(e) => save({ amount: Math.max(0, Number(amount) || 0), unit: e.target.value as CurrencyUnit })}>
        {(Object.keys(UNIT_LABEL) as CurrencyUnit[]).map((u) => (
          <option key={u} value={u}>
            {UNIT_LABEL[u]}
          </option>
        ))}
      </select>
      <span className="muted">altındakileri gizle, toplama katma</span>
      {hidden > 0 && <span className="pill">{hidden} item gizli</span>}
      {missingPrice && <span className="warn">{UNIT_LABEL[f.unit]} fiyatı yok, filtre çalışmıyor</span>}
      {f.amount > 0 && (
        <button
          onClick={() => {
            setAmount("");
            save({ amount: 0, unit: f.unit });
          }}
        >
          Kaldır
        </button>
      )}
    </div>
  );
}
