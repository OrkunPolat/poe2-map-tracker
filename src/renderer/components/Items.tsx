import type { TabletInfo, WaystoneInfo, WaystoneStats } from "../../shared/types";

/** Only the waystone's headline stats; individual monster mods are deliberately not shown. */
const STAT_LABELS: Array<[keyof WaystoneStats, string]> = [
  ["itemRarity", "Rarity"],
  ["packSize", "Pack Size"],
  ["monsterEffectiveness", "Monster Eff."],
  ["itemQuantity", "Quantity"],
  ["magicMonsters", "Magic"],
  ["rareMonsters", "Rare"],
  ["delirious", "Delirious"],
  ["dropChance", "Waystone Drop"],
];

export function WaystoneCard({ w, danger = [] }: { w: WaystoneInfo; danger?: string[] }) {
  return (
    <div className={`item rarity-${w.rarity.toLowerCase()} ${danger.length ? "danger" : ""}`}>
      {danger.length > 0 && (
        <div className="danger-banner">
          ⚠ Tehlikeli mod{danger.length > 1 ? "lar" : ""}: {danger.join(" · ")}
        </div>
      )}
      <div className="item-title">
        <span className="tier">T{w.stats.tier ?? "?"}</span>
        <span>{w.name || w.baseType}</span>
        {w.corrupted && <span className="tag corrupt">Corrupted</span>}
        {w.itemLevel != null && <span className="muted">ilvl {w.itemLevel}</span>}
      </div>
      <div className="chips">
        {STAT_LABELS.filter(([k]) => w.stats[k] != null).map(([k, label]) => (
          <span key={k} className="chip">
            {label} <b>{w.stats[k]}%</b>
          </span>
        ))}
        {STAT_LABELS.every(([k]) => w.stats[k] == null) && <span className="muted">Başlık statı bulunamadı</span>}
      </div>
    </div>
  );
}

export function TabletCard({ t, onRemove, compact }: { t: TabletInfo; onRemove?: () => void; compact?: boolean }) {
  const perUse = t.costDiv != null && t.totalUses ? t.costDiv / t.totalUses : undefined;
  return (
    <div className={`item rarity-${t.rarity.toLowerCase()}`}>
      <div className="item-title">
        <span className="tag type">{t.type}</span>
        <span>{t.name || t.baseType}</span>
        {t.usesLeft != null && (
          <span className="uses">
            {t.usesLeft}
            {t.totalUses ? `/${t.totalUses}` : ""} kullanım
          </span>
        )}
        {perUse != null && <span className="muted">{perUse.toFixed(2)} div/map</span>}
        {onRemove && (
          <button className="icon" title="Kaldır" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
      {!compact && t.mods.length > 0 && (
        <ul className="mods">
          {t.mods.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Screenshots({ files }: { files: string[] }) {
  if (files.length === 0) return null;
  return (
    <div className="shots">
      {files.map((f) => (
        <a key={f} href={`shot://img/${encodeURIComponent(f)}`} target="_blank" rel="noreferrer">
          <img src={`shot://img/${encodeURIComponent(f)}`} alt="screenshot" />
        </a>
      ))}
    </div>
  );
}
