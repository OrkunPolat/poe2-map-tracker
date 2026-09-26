import { useMemo, useState } from "react";
import type { Snapshot } from "../../shared/ipc";
import { avoidRegex, type WaystoneModFamily } from "../../shared/waystoneDanger";
import { api } from "../api";

/** "(80-120)% ... (260-300)%": the range a mod can roll across its tiers, first danger line only. */
function tierRange(f: WaystoneModFamily): string {
  // "(20-24)%" is a range, "(-4--3)%" a negative one; plain numbers count as both ends.
  const nums = f.tiers.flatMap((t) =>
    [...(t[0] ?? "").matchAll(/\((-?[\d.]+)-(-?[\d.]+)\)|(-?\d+(?:\.\d+)?)/g)].flatMap((m) => (m[3] ? [Number(m[3])] : [Number(m[1]), Number(m[2])])),
  );
  if (nums.length < 2) return "";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `${lo}` : `${lo} – ${hi}`;
}

export function WaystoneView({ snap }: { snap: Snapshot }) {
  const { waystoneMods, settings } = snap;
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string>();
  const marked = new Set(settings.dangerousMods);
  const toggle = (id: string) => {
    const next = new Set(marked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void api().setSettings({ dangerousMods: [...next] });
  };

  const families = waystoneMods.families;
  const shown = families.filter((f) => !q || (f.danger.join(" ") + f.rewards.join(" ")).toLowerCase().includes(q.toLowerCase()));
  const groups: Array<[string, WaystoneModFamily[]]> = [
    ["Prefix", shown.filter((f) => !f.desecrated && f.affix === "Prefix")],
    ["Suffix", shown.filter((f) => !f.desecrated && f.affix === "Suffix")],
    ["Desecrated", shown.filter((f) => f.desecrated)],
  ];
  const markedFams = families.filter((f) => marked.has(f.id));
  const { regex, missing } = useMemo(() => avoidRegex(markedFams, families), [settings.dangerousMods, families]);

  return (
    <div className="settings wide">
      <section>
        <h3>Waystone tehlike listesi</h3>
        <p className="hint">
          Build'in için ölümcül modları işaretle. Waystone'a <kbd>Ctrl</kbd>+<kbd>C</kbd> yaptığında bu modlardan biri varsa hem burada hem overlay'de kırmızı uyarı
          çıkar. Liste {new Date(waystoneMods.fetchedAt).toLocaleDateString("tr-TR")} tarihinde{" "}
          <a href={waystoneMods.source} target="_blank" rel="noreferrer">
            poe2db
          </a>
          'den alındı.
        </p>
        <div className="row">
          <input className="grow" placeholder="Mod ara (crit, resist, curse…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            onClick={async () => {
              setMsg("Güncelleniyor…");
              try {
                setMsg(await api().updateWaystoneMods());
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            poe2db'den güncelle
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </section>

      <section>
        <h3>Stash arama kodu ({markedFams.length} mod)</h3>
        {regex ? (
          <>
            <div className="row">
              <code className="regex">{regex}</code>
              <button className="primary" onClick={() => api().copyText(regex)}>
                Kopyala
              </button>
            </div>
            <p className="hint">
              Waystone sekmesinde <kbd>Ctrl</kbd>+<kbd>F</kbd> yapıp yapıştır: işaretli modlardan birini taşıyan waystone'lar söner, güvenliler yanar.
              {missing.length > 0 && <span className="warn"> Sığmayan/ayrıştırılamayan: {missing.length} mod.</span>}
            </p>
          </>
        ) : (
          <p className="muted">Aşağıdan en az bir mod işaretle.</p>
        )}
      </section>

      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title}>
            <h3>
              {title} <span className="muted">({list.length})</span>
            </h3>
            <table className="loot-table mods-table">
              <tbody>
                {list.map((f) => (
                  <tr key={f.id} className={marked.has(f.id) ? "danger-row" : ""} onClick={() => toggle(f.id)}>
                    <td className="chk">
                      <input type="checkbox" readOnly checked={marked.has(f.id)} />
                    </td>
                    <td>
                      {f.danger.map((d) => (
                        <div key={d}>{d}</div>
                      ))}
                      {f.rewards.length > 0 && <div className="reward">{f.rewards.join(" · ")}</div>}
                    </td>
                    <td className="num muted">{tierRange(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ),
      )}
    </div>
  );
}
