import { useState } from "react";
import type { Snapshot } from "../../shared/ipc";
import type { Settings } from "../../shared/types";
import { api } from "../api";
import { PageHead } from "../App";
import { TabCheckList } from "./Onboarding";
import { TradeSetup } from "./StashView";
import { WaystoneView } from "./WaystoneView";
import { CustomPriceList } from "./Unpriced";

const SECTIONS = [
  ["general", "Genel"],
  ["stash", "Stash"],
  ["waystone", "Waystone uyarıları"],
  ["overlay", "Overlay & kısayollar"],
  ["loot", "Loot & maliyet"],
  ["data", "Veri & güncelleme"],
  ["debug", "Debug"],
] as const;
type Section = (typeof SECTIONS)[number][0];

export function SettingsView({ snap, onWizard }: { snap: Snapshot; onWizard: () => void }) {
  const [section, setSection] = useState<Section>(() => {
    const legacy = location.hash.includes("waystone") ? "waystone" : location.hash.includes("debug") ? "debug" : undefined;
    return (SECTIONS.find(([s]) => location.hash.endsWith(`:${s}`))?.[0] ?? legacy ?? "general") as Section;
  });
  return (
    <>
      <PageHead title="Ayarlar">
        <button onClick={onWizard}>Kurulum sihirbazı</button>
      </PageHead>
      <div className="settings-layout">
        <nav className="subnav">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={section === id ? "on" : ""} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {section === "general" && <General snap={snap} />}
          {section === "stash" && <StashSettings snap={snap} />}
          {section === "waystone" && <WaystoneView snap={snap} />}
          {section === "overlay" && <OverlaySettings snap={snap} />}
          {section === "loot" && <LootSettings snap={snap} />}
          {section === "data" && <DataSettings snap={snap} />}
          {section === "debug" && <DebugView snap={snap} />}
        </div>
      </div>
    </>
  );
}

const useSet = () => (patch: Partial<Settings>) => void api().setSettings(patch);

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-body">
        {children}
        {hint && <p className="hint">{hint}</p>}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
      <span>{children}</span>
    </label>
  );
}

function General({ snap }: { snap: Snapshot }) {
  const { settings, status, prices } = snap;
  const set = useSet();
  const [charName, setCharName] = useState(settings.characterName);
  return (
    <section className="card">
      <Field label="Oyun nerede çalışıyor" hint="GeForce Now'da Client.txt ve Ctrl+C yok; map'leri kısayolla başlatırsın, kazanç yine stash farkından gelir.">
        <div className="seg">
          <button className={settings.playMode === "local" ? "on" : ""} onClick={() => set({ playMode: "local" })}>
            Bu bilgisayarda
          </button>
          <button className={settings.playMode === "gfn" ? "on" : ""} onClick={() => set({ playMode: "gfn" })}>
            GeForce Now / bulut
          </button>
        </div>
      </Field>
      {settings.playMode === "local" && (
      <Field label="Client.txt" hint="Genelde: Steam → steamapps\common\Path of Exile 2\logs\Client.txt">
        <p className={status.logFound ? "ok" : "warn"}>
          {status.logFound ? "Bağlı · " : "Bulunamadı · "}
          <code>{status.logPath ?? "otomatik tespit başarısız"}</code>
        </p>
        <div className="row">
          <button onClick={() => void api().pickLogFile()}>Dosya seç…</button>
          {settings.logPath && <button onClick={() => set({ logPath: "" })}>Otomatik tespit</button>}
        </div>
      </Field>
      )}
      <Field label="Lig (fiyatlar)" hint={prices ? `poe.ninja · ${Object.keys(prices.divByName).length} item · ${new Date(prices.fetchedAt).toLocaleTimeString("tr-TR")}` : status.priceError}>
        <div className="row">
          <select value={settings.league} onChange={(e) => set({ league: e.target.value })}>
            {(status.leagues.length ? status.leagues : [settings.league]).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button onClick={() => void api().refreshPrices()}>Fiyatları güncelle</button>
        </div>
      </Field>
      <Field label="Karakter adı" hint="Boş bırakırsan party'deki herkesin ölümü sayılır.">
        <input value={charName} onChange={(e) => setCharName(e.target.value)} onBlur={() => set({ characterName: charName })} placeholder="Karakter adı" />
      </Field>
      <Field label="Oturum arası" hint="Bundan uzun ara yeni farm oturumu sayılır.">
        <div className="row">
          <input className="qty" type="number" min={5} value={settings.sessionGapMin} onChange={(e) => set({ sessionGapMin: Math.max(5, Number(e.target.value) || 30) })} />
          <span className="muted">dakika</span>
        </div>
      </Field>
    </section>
  );
}

function StashSettings({ snap }: { snap: Snapshot }) {
  const { settings, status } = snap;
  const set = useSet();
  const [stashKey, setStashKey] = useState(settings.stashHotkey);
  return (
    <>
      <TradeSetup account={settings.tradeAccount} />
      <section className="card">
        <Field
          label="Otomatik loot"
          hint={`Map'e girdikten ${settings.autoStashDelaySec} sn sonra stash okunur; bir sonraki okumayla farkı o map'in kazancı olur. Trade sitesi birkaç dakika gecikmeli; kazançlar bir sonraki map'e kayıyorsa süreyi artır.`}
        >
          <Toggle checked={settings.autoStash} onChange={(v) => set({ autoStash: v })}>
            Her map'te stash'i otomatik oku, kazancı stash farkından hesapla
          </Toggle>
          <div className="row">
            <span className="muted">Okuma gecikmesi</span>
            <input
              className="qty"
              type="number"
              min={30}
              value={settings.autoStashDelaySec}
              onChange={(e) => set({ autoStashDelaySec: Math.max(30, Number(e.target.value) || 150) })}
            />
            <span className="muted">sn</span>
          </div>
        </Field>
        <Field label="Sekme kontrolü">
          <button disabled={!settings.tradeAccount || status.stashBusy} onClick={() => void api().checkTabSetup()}>
            {status.stashBusy ? "Kontrol ediliyor…" : "Public sekmeleri kontrol et"}
          </button>
          {status.tabCheck && <TabCheckList issues={status.tabCheck.issues} />}
        </Field>
        <Field label="Ekrandan okuma" hint="Trade yerine: oyunda özel stash sekmesi açıkken bas; ekranın sol yarısı okunur.">
          <div className="row">
            <input value={stashKey} onChange={(e) => setStashKey(e.target.value)} />
            <button onClick={() => set({ stashHotkey: stashKey })}>Kaydet</button>
            <HotkeyState ok={status.stashHotkeyRegistered} />
          </div>
        </Field>
      </section>
    </>
  );
}

function HotkeyState({ ok }: { ok: boolean }) {
  return <span className={`pill ${ok ? "ok" : "warn"}`}>{ok ? "aktif" : "kayıtlı değil"}</span>;
}

function OverlaySettings({ snap }: { snap: Snapshot }) {
  const { settings, status } = snap;
  const set = useSet();
  const [ovKey, setOvKey] = useState(settings.overlayHotkey);
  const [shotKey, setShotKey] = useState(settings.screenshotHotkey);
  const [pcKey, setPcKey] = useState(settings.priceCheckHotkey);
  return (
    <section className="card">
      <Field label="Overlay" hint="Oyun Windowed Fullscreen modda olmalı. Panel sürüklenerek taşınır, yeri hatırlanır.">
        <Toggle checked={settings.overlayEnabled} onChange={(v) => set({ overlayEnabled: v })}>
          Oyunun üstünde küçük paneli göster
        </Toggle>
        <div className="row">
          <span className="muted">Opaklık</span>
          <input type="range" min={0.4} max={1} step={0.05} value={settings.overlayOpacity} onChange={(e) => set({ overlayOpacity: Number(e.target.value) })} />
          <button onClick={() => set({ overlayPos: undefined })}>Sağ üste al</button>
        </div>
      </Field>
      {settings.playMode === "gfn" && <GfnHotkeys snap={snap} />}
      <Field label="Overlay aç/kapa">
        <div className="row">
          <input value={ovKey} onChange={(e) => setOvKey(e.target.value)} />
          <button onClick={() => set({ overlayHotkey: ovKey })}>Kaydet</button>
          <HotkeyState ok={status.overlayHotkeyRegistered} />
        </div>
      </Field>
      <Field
        label="Fiyat kontrolü"
        hint="Fareyi item'ın üstünde tut ve bas. Mac'te Alt = Option (⌥); oyunda Option basılıyken modların aralıkları da okunur. İlk kullanımda Mac ekran kaydı izni ister."
      >
        <div className="row">
          <input value={pcKey} onChange={(e) => setPcKey(e.target.value)} />
          <button onClick={() => set({ priceCheckHotkey: pcKey })}>Kaydet</button>
          <HotkeyState ok={!!status.priceCheckHotkeyRegistered} />
        </div>
      </Field>
      <Field label="Ekran görüntüsü" hint="Map içindeyken o map'e, hideout'tayken sonraki map'e eklenir.">
        <div className="row">
          <input value={shotKey} onChange={(e) => setShotKey(e.target.value)} />
          <button onClick={() => set({ screenshotHotkey: shotKey })}>Kaydet</button>
          <HotkeyState ok={status.hotkeyRegistered} />
        </div>
      </Field>
      <Field label="Pencere">
        <Toggle checked={settings.alwaysOnTop} onChange={(v) => set({ alwaysOnTop: v })}>
          Ana pencere her zaman üstte
        </Toggle>
      </Field>
    </section>
  );
}

function LootSettings({ snap }: { snap: Snapshot }) {
  const { settings } = snap;
  const set = useSet();
  const [favs, setFavs] = useState(settings.favoriteCurrencies.join("\n"));
  return (
    <section className="card">
      <Field label="Loot butonları" hint="Elle girişte gösterilen item'lar; her satıra bir tane, oyundaki İngilizce adıyla.">
        <textarea rows={7} value={favs} onChange={(e) => setFavs(e.target.value)} />
        <button onClick={() => set({ favoriteCurrencies: favs.split("\n").map((s) => s.trim()).filter(Boolean) })}>Kaydet</button>
      </Field>
      <Field label="Elle girilen fiyatlar" hint="poe.ninja'da olmayan item'lar (unique, gem…) için verdiğin değerler.">
        <CustomPriceList snap={snap} />
      </Field>
      <Field label="Tabletler">
        <Toggle checked={settings.trackTabletUses} onChange={(v) => set({ trackTabletUses: v })}>
          Tabletler map'ten sonra kalsın, kullanım hakları azalsın
        </Toggle>
        <div className="row">
          <span className="muted">Varsayılan kullanım hakkı</span>
          <input className="qty" type="number" min={1} value={settings.defaultTabletUses} onChange={(e) => set({ defaultTabletUses: Math.max(1, Number(e.target.value) || 1) })} />
        </div>
      </Field>
      <Field label="Juice">
        <Toggle checked={settings.repeatCosts} onChange={(v) => set({ repeatCosts: v })}>
          Aynı juice'u her map'e tekrar yaz
        </Toggle>
      </Field>
      <Field label="Pano">
        <Toggle checked={settings.captureCurrencyFromClipboard} onChange={(v) => set({ captureCurrencyFromClipboard: v })}>
          Currency stack'ine Ctrl+C yapınca son map'e ekle
        </Toggle>
      </Field>
    </section>
  );
}

function DataSettings({ snap }: { snap: Snapshot }) {
  const { status } = snap;
  return (
    <section className="card">
      <Field label="Güncelleme" hint="Açılışta ve 6 saatte bir kontrol edilir; güncelleme verilerini korur.">
        <div className="row">
          <span>
            Sürüm <b>v{status.version}</b>
          </span>
          <button onClick={() => void api().checkUpdate()}>Kontrol et</button>
          {status.update ? (
            <button className="primary" onClick={() => void api().installUpdate()}>
              v{status.update.version} yükle
            </button>
          ) : (
            status.updateCheckedAt && <span className="pill ok">Güncel</span>
          )}
        </div>
      </Field>
      <Field label="Veri" hint="Tüm kayıtlar veri klasöründeki tracker-data.json dosyasında.">
        <div className="row">
          <button onClick={() => void api().openDataFolder()}>Veri klasörünü aç</button>
          <button
            onClick={async () => {
              const p = await api().exportCsv();
              if (p) alert(`Kaydedildi: ${p}`);
            }}
          >
            CSV dışa aktar
          </button>
        </div>
      </Field>
    </section>
  );
}

function DebugView({ snap }: { snap: Snapshot }) {
  const { debug, state } = snap;
  return (
    <section className="card">
      <Field label="Konum">
        <code>
          {state.location.kind} · {state.location.areaId || "–"} · aktif run: {state.activeRunId ?? "yok"}
        </code>
      </Field>
      <Field label="Son log satırları">
        <pre>{debug.recentLog.join("\n") || "Henüz yok. Oyunda bölge değiştirince burada satırlar görünmeli."}</pre>
      </Field>
      <Field label={`Son pano (${debug.lastClipboard?.kind ?? "–"})`}>
        <pre>{debug.lastClipboard?.text ?? "Oyunda bir item'ın üstünde Ctrl+C yap."}</pre>
      </Field>
    </section>
  );
}

function GfnHotkeys({ snap }: { snap: Snapshot }) {
  const { settings, status } = snap;
  const set = useSet();
  const [start, setStart] = useState(settings.gfnStartHotkey);
  const [end, setEnd] = useState(settings.gfnEndHotkey);
  return (
    <Field label="GeForce Now kısayolları" hint="Yeni map / hideout'a dönüş. Mac'te CommandOrControl = ⌘.">
      <div className="row">
        <input value={start} onChange={(e) => setStart(e.target.value)} />
        <input value={end} onChange={(e) => setEnd(e.target.value)} />
        <button onClick={() => set({ gfnStartHotkey: start, gfnEndHotkey: end })}>Kaydet</button>
        <HotkeyState ok={!!status.gfnHotkeysRegistered} />
      </div>
    </Field>
  );
}
