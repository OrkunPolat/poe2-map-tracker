import { useState } from "react";
import type { Snapshot } from "../../shared/ipc";
import { SUGGESTED_TABS, suggestedName, type TabIssue } from "../../shared/tabCheck";
import { api } from "../api";

/** Result list of the public-tab check, shared by onboarding and the Stash screen. */
export function TabCheckList({ issues }: { issues: TabIssue[] }) {
  const order: TabIssue["kind"][] = ["duplicatePrice", "wrongNote", "noName", "ok", "missing"];
  const sorted = [...issues].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <ul className="check-list">
      {sorted.map((i, n) => {
        switch (i.kind) {
          case "ok":
            return (
              <li key={n} className="ok">
                ✓ <code>{i.tab}</code> · {i.items} item
              </li>
            );
          case "missing":
            return (
              <li key={n} className="muted">
                ○ Yok: <code>{i.suggested}</code> <CopyBtn text={i.suggested} /> <span className="hint">(o farm'ı yapmıyorsan boş ver)</span>
              </li>
            );
          case "noName":
            return (
              <li key={n} className="warn">
                ⚠ <code>{i.tab}</code>: isim yok, sonuna farm adını ekle (ör. <code>{i.tab} Ritual</code>)
              </li>
            );
          case "duplicatePrice":
            return (
              <li key={n} className="warn">
                ⚠ Aynı fiyat ({i.price}) birden fazla sekmede: {i.tabs.map((t) => <code key={t}>{t}</code>)}. Her sekmeye farklı sayı ver.
              </li>
            );
          case "wrongNote":
            return (
              <li key={n} className="warn">
                ✗ <code>{i.tab}</code> okunmuyor: {i.hint}.
              </li>
            );
        }
      })}
    </ul>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy"
      onClick={() => {
        api().copyText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "✓" : "Kopyala"}
    </button>
  );
}

const STEPS = ["Oyun", "Hesap", "Stash sekmeleri", "Kontrol", "Kısayollar"] as const;

/** First-run setup: every step can be skipped; reachable again from Settings. */
export function Onboarding({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const { status, settings } = snap;
  const [step, setStep] = useState(() => Number(/wizard=(\d)/.exec(location.hash)?.[1] ?? 0));
  const [account, setAccount] = useState(settings.tradeAccount);
  const finish = () => {
    void api().setSettings({ onboarded: true });
    onClose();
  };

  return (
    <div className="modal-back">
      <div className="modal">
        <div className="steps-bar">
          {STEPS.map((s, i) => (
            <button key={s} className={i === step ? "on" : i < step ? "done" : ""} onClick={() => setStep(i)}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <section>
            <h2>Oyunu nerede oynuyorsun?</h2>
            <div className="seg">
              <button className={settings.playMode === "local" ? "on" : ""} onClick={() => void api().setSettings({ playMode: "local" })}>
                Bu bilgisayarda
              </button>
              <button className={settings.playMode === "gfn" ? "on" : ""} onClick={() => void api().setSettings({ playMode: "gfn" })}>
                GeForce Now / bulut
              </button>
            </div>
            {settings.playMode === "gfn" ? (
              <p>
                Bulutta oyunun log dosyası ve Ctrl+C bu bilgisayara gelmez. Her map'e girerken bir kısayola basarsın (overlay'de de buton var); map'in kazancı
                stash farkından otomatik hesaplanır. Bunun için 2. ve 3. adımlar (hesap adı, public sekmeler) şart.
              </p>
            ) : (
              <>
                <p>Map giriş-çıkışlarını, süreyi ve ölümleri oyunun <code>Client.txt</code> dosyasından okuyoruz.</p>
                <p className={status.logFound ? "ok" : "warn"}>
                  {status.logFound ? "✓ Bulundu: " : "✗ Bulunamadı. "}
                  <code>{status.logPath ?? "—"}</code>
                </p>
                {!status.logFound && <button onClick={() => void api().pickLogFile()}>Client.txt seç…</button>}
                <p className="hint">Genelde: Steam → steamapps\common\Path of Exile 2\logs\Client.txt</p>
              </>
            )}
          </section>
        )}

        {step === 1 && (
          <section>
            <h2>PoE hesap adın</h2>
            <p>
              Stash'ini trade sitesinden okumak için gerekli. pathofexile.com profilindeki tam ad, <b>#</b> ve 4 haneyle: <code>İsim#1234</code>
            </p>
            <div className="row">
              <input className="grow" placeholder="Orkun#1234" value={account} onChange={(e) => setAccount(e.target.value)} />
              <button className="primary" disabled={!/^.+#\d{4}$/.test(account.trim())} onClick={() => void api().setSettings({ tradeAccount: account.trim() })}>
                Kaydet
              </button>
            </div>
            {settings.tradeAccount && <p className="ok">✓ Kayıtlı: {settings.tradeAccount}</p>}
            <p className="hint">Giriş yapılmaz, şifre ya da POESESSID istenmez; sadece herkese açık trade verisi okunur.</p>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2>Stash sekmelerini hazırla</h2>
            <ol className="steps">
              <li>
                Takip etmek istediğin her sekmeye oyunda sağ tık → <b>Public</b>. <span className="warn">Merchant's Tab kullanma</span>, orada item'lar anında
                satılabilir.
              </li>
              <li>Sekmenin adını aşağıdaki gibi yap. Fahiş fiyat item'ların sadece trade sitesinde görünmesi için; kimse almaz. Sondaki isim uygulamada sekme adı olur.</li>
            </ol>
            <table className="loot-table">
              <tbody>
                {SUGGESTED_TABS.map((t) => (
                  <tr key={t.price}>
                    <td>{t.name}</td>
                    <td>
                      <code>{suggestedName(t)}</code>
                    </td>
                    <td className="num">
                      <CopyBtn text={suggestedName(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              Hepsini yapmak zorunda değilsin, farm ettiklerin yeter. Kural: her sekmede farklı sayı (990-998) ve <b>divine</b>. İsim oyuna sığmazsa kısalt
              (Exped gibi).
            </p>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2>Kontrol</h2>
            <p>Trade sitesinde hesabındaki public sekmeleri tarar; eksik ya da hatalı olanları söyler. Trade sitesi değişiklikleri birkaç dakika gecikmeyle görür.</p>
            <div className="row">
              <button className="primary" disabled={!settings.tradeAccount || status.stashBusy} onClick={() => void api().checkTabSetup()}>
                {status.stashBusy ? "Kontrol ediliyor…" : "Kontrol et"}
              </button>
              {!settings.tradeAccount && <span className="warn">Önce 2. adımda hesap adını gir.</span>}
              {status.stashBusy && status.stashMessage && <span className="muted">{status.stashMessage.text}</span>}
            </div>
            {status.tabCheck && <TabCheckList issues={status.tabCheck.issues} />}
          </section>
        )}

        {step === 4 && (
          <section>
            <h2>Kısayollar</h2>
            <table className="loot-table">
              <tbody>
                <tr>
                  <td>
                    <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> (oyunda item üstünde)
                  </td>
                  <td>Waystone / tablet'i sonraki map'e ekler</td>
                </tr>
                <tr>
                  <td>
                    <kbd>{settings.overlayHotkey}</kbd>
                  </td>
                  <td>Oyun üstü paneli aç / kapat</td>
                </tr>
                <tr>
                  <td>
                    <kbd>{settings.stashHotkey}</kbd>
                  </td>
                  <td>Açık stash sekmesini ekrandan okur (trade yerine)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>{settings.screenshotHotkey}</kbd>
                  </td>
                  <td>Ekran görüntüsü alıp map'e ekler</td>
                </tr>
              </tbody>
            </table>
            <p>
              Son adım: <b>Waystone</b> sekmesinden build'in için tehlikeli modları işaretle; waystone kopyaladığında uyarı alırsın. Oyunu <b>Windowed
              Fullscreen</b> modda aç ki overlay görünsün.
            </p>
          </section>
        )}

        <div className="modal-foot">
          <button onClick={finish}>Atla</button>
          <div className="row">
            {step > 0 && <button onClick={() => setStep(step - 1)}>Geri</button>}
            {step < STEPS.length - 1 ? (
              <button className="primary" onClick={() => setStep(step + 1)}>
                İleri
              </button>
            ) : (
              <button className="primary" onClick={finish}>
                Bitir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
