import { useState } from "react";
import { stashValueDiv, tabValueDiv } from "../../shared/stash";
import type { Snapshot } from "../../shared/ipc";
import type { PriceTable, StashTab } from "../../shared/types";
import { api, fmtDiv, fmtEx, fmtValue } from "../api";

/** Special tabs worth reading (Map, Gem and Unique tabs are left out on purpose). */
const EXPECTED = ["Currency", "Essences", "Abyss", "Ritual", "Delirium", "Breach", "Expedition", "Fragments", "Runes", "SoulCores", "Idols"];

const ago = (ts: number, now: number) => {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} saat önce` : `${Math.round(h / 24)} gün önce`;
};

export function StashView({ snap }: { snap: Snapshot }) {
  const { stash, prices, status, settings, now } = snap;
  const total = stashValueDiv(stash, prices);
  const last = stash.history[stash.history.length - 1];
  const prev = stash.history[stash.history.length - 2];
  // With trade sync the placeholders are noise: the user decides which tabs are public.
  const missing = settings.tradeAccount ? [] : EXPECTED.filter((c) => !stash.tabs.some((t) => t.category === c));

  return (
    <div className="stash">
      <section className="card stash-head">
        <div>
          <div className="muted small-caps">Stash değeri</div>
          <div className="big">
            {fmtDiv(total)} div <span className="muted">{fmtEx(total, prices?.exPerDiv)}</span>
          </div>
          {prev && last && (
            <div className={last.div >= prev.div ? "ok" : "warn"}>
              Son yenilemeye göre {last.div >= prev.div ? "+" : ""}
              {fmtDiv(last.div - prev.div)} div ({ago(prev.ts, now)})
            </div>
          )}
        </div>
        <div className="stash-actions">
          <button className="primary" onClick={() => void api().stashRefresh()}>
            ⟳ Yenile
          </button>
          <p className="hint">
            {settings.tradeAccount
              ? "Public sekmeleri trade sitesinden yeniden okur, güncel poe.ninja fiyatıyla hesaplar ve geçmişe kaydeder."
              : "Tüm okunmuş sekmeleri güncel poe.ninja fiyatıyla yeniden hesaplar ve geçmişe kaydeder."}
          </p>
        </div>
      </section>

      <TradeSetup account={settings.tradeAccount} />

      <section className="card how">
        <b>Ya da ekrandan oku:</b> oyunda stash'te bir özel sekmeyi aç (Currency, Ritual, Abyss…) ve{" "}
        <kbd>{settings.stashHotkey}</kbd> bas. Uygulama ekranın sol yarısını okur; item'ları ikonlarından, sayıları OCR ile bulur.
        <br />
        <span className="muted">
          Sekmeleri otomatik değiştiremeyiz: oyuna tıklama göndermek GGG kurallarına aykırı. Her sekme için bir kez tuşa basman yeterli.
        </span>
        {status.stashBusy && <div className="gold">Okunuyor…</div>}
        {status.stashMessage && !status.stashBusy && (
          <div className={status.stashMessage.ok ? "ok" : "warn"}>
            {status.stashMessage.text} <span className="muted">({ago(status.stashMessage.at, now)})</span>
          </div>
        )}
      </section>

      <div className="stash-grid">
        {[...stash.tabs]
          .sort((a, b) => tabValueDiv(b, prices) - tabValueDiv(a, prices))
          .map((t) => (
            <TabCard key={t.id} tab={t} prices={prices} now={now} />
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

function TabCard({ tab, prices, now }: { tab: StashTab; prices?: PriceTable; now: number }) {
  const value = tabValueDiv(tab, prices);
  const rows = [...tab.items].sort(
    (a, b) => (b.qty ?? 0) * (prices?.divByName[b.name] ?? 0) - (a.qty ?? 0) * (prices?.divByName[a.name] ?? 0),
  );
  const unread = tab.items.filter((i) => i.qty == null).length;
  const trade = tab.source === "trade";
  return (
    <section className="card tab-card">
      <div className="card-head">
        <h3>
          {tab.label} <span className={`tag ${trade ? "" : "type"}`}>{trade ? "trade" : "ekran"}</span>
        </h3>
        <b className="gold">{fmtDiv(value)} div</b>
      </div>
      <p className="muted small">
        {ago(tab.capturedAt, now)} · {tab.items.length} item
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
      <table className="loot-table">
        <tbody>
          {rows.map((it) => {
            const unit = prices?.divByName[it.name];
            return (
              <tr key={it.name} className={it.qty == null ? "unread" : ""}>
                <td>{it.name}</td>
                <td>
                  <input
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
                </td>
                <td className="num muted">{unit != null ? fmtValue(unit, prices?.exPerDiv) : "–"}</td>
                <td className="num">{unit != null && it.qty ? fmtValue(unit * it.qty, prices?.exPerDiv) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="danger" onClick={() => confirm(`${tab.label} sekmesi silinsin mi?`) && void api().stashDeleteTab(tab.id)}>
        Sekmeyi sil
      </button>
    </section>
  );
}

/** Setup for reading public tabs from the trade site (the PoE Overlay method). */
function TradeSetup({ account }: { account: string }) {
  const [value, setValue] = useState(account);
  const valid = /^.+#\d{4}$/.test(value.trim()) || value.trim() === "";
  return (
    <section className="card how">
      <b>Otomatik okuma (trade sitesi üzerinden)</b>
      <ol className="steps">
        <li>
          Oyunda okumak istediğin sekmeye sağ tık → <b>Public</b> yap. <span className="warn">Merchant's Tab kullanma</span> (orada item'lar anında satılabilir).
        </li>
        <li>
          Sekmenin adını <code>~price 991 divine</code> yap. Her sekmeye farklı sayı ver: <code>992</code>, <code>993</code>… (990-999 arası).
          Bu fahiş fiyat item'ların sadece trade sitesinde görünmesini sağlar, kimse almaz.
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
        Trade sitesi değişiklikleri birkaç dakika gecikmeyle görür. Gem, unique gibi her item okunur (100 item/sekme sınırı). Giriş yapılmaz, şifre ya da POESESSID
        istenmez; sadece herkese açık trade verisi okunur ve trade sitesinin istek sınırlarına uyulur.
      </p>
    </section>
  );
}
