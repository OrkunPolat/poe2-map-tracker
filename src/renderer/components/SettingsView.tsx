import { useState } from "react";
import type { Snapshot } from "../../shared/ipc";
import type { Settings } from "../../shared/types";
import { api } from "../api";

export function SettingsView({ snap }: { snap: Snapshot }) {
  const { settings, status, prices } = snap;
  const set = (patch: Partial<Settings>) => void api().setSettings(patch);
  const [hotkey, setHotkey] = useState(settings.screenshotHotkey);
  const [favs, setFavs] = useState(settings.favoriteCurrencies.join("\n"));
  const [charName, setCharName] = useState(settings.characterName);
  const [ovKey, setOvKey] = useState(settings.overlayHotkey);

  return (
    <div className="settings">
      <section>
        <h3>Client.txt</h3>
        <p className={status.logFound ? "ok" : "warn"}>
          {status.logFound ? "Bağlı: " : "Bulunamadı. "}
          <code>{status.logPath ?? "otomatik tespit başarısız"}</code>
        </p>
        <div className="row">
          <button onClick={() => void api().pickLogFile()}>Dosya seç…</button>
          {settings.logPath && <button onClick={() => set({ logPath: "" })}>Otomatik tespite dön</button>}
        </div>
        <p className="hint">Genelde: Steam → steamapps\common\Path of Exile 2\logs\Client.txt</p>
      </section>

      <section>
        <h3>Karakter adı</h3>
        <input value={charName} onChange={(e) => setCharName(e.target.value)} onBlur={() => set({ characterName: charName })} placeholder="Boş: party'deki herkesin ölümü sayılır" />
      </section>

      <section>
        <h3>Fiyatlar (poe.ninja)</h3>
        <div className="row">
          <select value={settings.league} onChange={(e) => set({ league: e.target.value })}>
            {(status.leagues.length ? status.leagues : [settings.league]).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button onClick={() => void api().refreshPrices()}>Şimdi güncelle</button>
        </div>
        <p className="hint">
          {prices ? `${Object.keys(prices.divByName).length} item, ${new Date(prices.fetchedAt).toLocaleTimeString("tr-TR")}` : "Henüz fiyat yok"}
          {status.priceError && <span className="warn"> · Hata: {status.priceError}</span>}
        </p>
      </section>

      <section>
        <h3>Screenshot kısayolu</h3>
        <div className="row">
          <input value={hotkey} onChange={(e) => setHotkey(e.target.value)} />
          <button onClick={() => set({ screenshotHotkey: hotkey })}>Kaydet</button>
          <span className={status.hotkeyRegistered ? "ok" : "warn"}>{status.hotkeyRegistered ? "aktif" : "kayıtlı değil"}</span>
        </div>
        <p className="hint">Electron formatı: Ctrl+Shift+S, F9, Alt+F10… Map içindeyken çekilen görüntü o map'e, hideout'tayken sonraki map'e eklenir.</p>
      </section>

      <section>
        <h3>Oyun üstü panel (overlay)</h3>
        <label className="check">
          <input type="checkbox" checked={settings.overlayEnabled} onChange={(e) => set({ overlayEnabled: e.target.checked })} />
          Oyunun üstünde küçük paneli göster
        </label>
        <div className="row">
          <span>Aç/kapa kısayolu</span>
          <input value={ovKey} onChange={(e) => setOvKey(e.target.value)} />
          <button onClick={() => set({ overlayHotkey: ovKey })}>Kaydet</button>
          <span className={status.overlayHotkeyRegistered ? "ok" : "warn"}>{status.overlayHotkeyRegistered ? "aktif" : "kayıtlı değil"}</span>
        </div>
        <div className="row">
          <span>Opaklık</span>
          <input
            type="range" min={0.4} max={1} step={0.05} value={settings.overlayOpacity}
            onChange={(e) => set({ overlayOpacity: Number(e.target.value) })}
          />
          <button onClick={() => set({ overlayPos: undefined })}>Sağ üste geri al</button>
        </div>
        <p className="hint">Panel sürüklenerek taşınabilir, yeri hatırlanır. Oyun Windowed Fullscreen (borderless) modda olmalı; exclusive fullscreen'de görünmez. İlk 4 loot butonu panelde de var.</p>
      </section>

      <section>
        <h3>Loot butonları</h3>
        <textarea rows={8} value={favs} onChange={(e) => setFavs(e.target.value)} />
        <button onClick={() => set({ favoriteCurrencies: favs.split("\n").map((s) => s.trim()).filter(Boolean) })}>Kaydet</button>
        <p className="hint">Her satıra bir item, oyundaki İngilizce adıyla (poe.ninja ile eşleşmeli).</p>
      </section>

      <section>
        <h3>Davranış</h3>
        <label className="check">
          <input type="checkbox" checked={settings.trackTabletUses} onChange={(e) => set({ trackTabletUses: e.target.checked })} />
          Tabletler map'ten sonra hazırlıkta kalsın, kullanım hakları azalsın (bitince düşer)
        </label>
        <label className="check">
          Varsayılan tablet kullanım hakkı
          <input
            className="qty"
            type="number"
            min={1}
            value={settings.defaultTabletUses}
            onChange={(e) => set({ defaultTabletUses: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.captureCurrencyFromClipboard} onChange={(e) => set({ captureCurrencyFromClipboard: e.target.checked })} />
          Currency stack'ine Ctrl+C yapınca son map'in loot'una ekle (stack'in tamamı eklenir)
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.alwaysOnTop} onChange={(e) => set({ alwaysOnTop: e.target.checked })} />
          Pencere her zaman üstte (oyun Windowed Fullscreen olmalı)
        </label>
      </section>

      <section>
        <h3>Veri</h3>
        <div className="row">
          <button onClick={() => void api().openDataFolder()}>Veri klasörünü aç</button>
          <button
            onClick={async () => {
              const p = await api().exportCsv();
              if (p) alert(`Kaydedildi: ${p}`);
            }}
          >
            CSV dışa aktar (Excel)
          </button>
        </div>
      </section>
    </div>
  );
}

export function DebugView({ snap }: { snap: Snapshot }) {
  const { debug, state } = snap;
  return (
    <div className="settings">
      <section>
        <h3>Konum</h3>
        <code>
          {state.location.kind} · {state.location.areaId || "–"} · aktif run: {state.activeRunId ?? "yok"}
        </code>
      </section>
      <section>
        <h3>Son tanınan log satırları</h3>
        <pre>{debug.recentLog.join("\n") || "Henüz yok. Oyunda bölge değiştirince burada satırlar görünmeli."}</pre>
      </section>
      <section>
        <h3>Son pano ({debug.lastClipboard?.kind ?? "–"})</h3>
        <pre>{debug.lastClipboard?.text ?? "Oyunda bir item'ın üstünde Ctrl+C yap."}</pre>
      </section>
    </div>
  );
}
