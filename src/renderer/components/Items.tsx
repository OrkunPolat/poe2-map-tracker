import type { TabletInfo, WaystoneInfo, WaystoneStats } from "../../shared/types";

const STAT_LABELS: Array<[keyof WaystoneStats, string]> = [
  ["itemRarity", "Rarity"],
  ["itemQuantity", "Quantity"],
  ["packSize", "Pack Size"],
  ["monsterEffectiveness", "Monster Eff."],
  ["magicMonsters", "Magic"],
  ["rareMonsters", "Rare"],
  ["delirious", "Delirious"],
  ["gold", "Gold"],
  ["dropChance", "Waystone Drop"],
];

export function WaystoneCard({ w, compact }: { w: WaystoneInfo; compact?: boolean }) {
  return (
    <div className={`item rarity-${w.rarity.toLowerCase()}`}>
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
      </div>
      {!compact && (
        <ul className="mods">
          {w.mods.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TabletCard({ t, onRemove, compact }: { t: TabletInfo; onRemove?: () => void; compact?: boolean }) {
  return (
    <div className={`item rarity-${t.rarity.toLowerCase()}`}>
      <div className="item-title">
        <span className="tag type">{t.type}</span>
        <span>{t.name || t.baseType}</span>
        {t.usesRemaining != null && <span className="muted">{t.usesRemaining} kullanım</span>}
        {onRemove && (
          <button className="icon" title="Kaldır" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
      {!compact && (
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
