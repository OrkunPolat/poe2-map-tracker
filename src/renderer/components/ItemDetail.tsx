import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ItemHistory, PriceTable } from "../../shared/types";
import { PairChart } from "./PairChart";
import { hourlyUnits, priceHistory } from "../../shared/trends";
import { api, fmtDiv } from "../api";

type Unit = "div" | "chaos";
const UNIT_KEY = "itemDetailUnit";

function loadUnit(): Unit {
  try {
    return localStorage.getItem(UNIT_KEY) === "chaos" ? "chaos" : "div";
  } catch {
    return "div";
  }
}

const fmtUnit = (v: number, unit: Unit) => {
  const n = Math.abs(v) >= 100 ? Math.round(v).toLocaleString("tr-TR") : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(2);
  return `${n} ${unit}`;
};

/** 13764 -> "13,8k": short enough for a narrow column. */
export const fmtCompact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : fmtUnits(n));

export const fmtUnits = (n: number) => (n >= 10 ? Math.round(n).toLocaleString("tr-TR") : n.toFixed(1));

const PAIR_NAME: Record<string, string> = { exalted: "Exalted Orb", chaos: "Chaos Orb", divine: "Divine Orb" };
const PAIR_ORDER = ["exalted", "chaos", "divine"];
const PAIR_KEY = "itemDetailPair";
const RANGES = [
  { label: "24 sa", ms: 24 * 3600 * 1000 },
  { label: "3 gün", ms: 3 * 24 * 3600 * 1000 },
  { label: "7 gün", ms: 7 * 24 * 3600 * 1000 },
  { label: "Tümü", ms: 0 },
];

function loadPair(): string {
  try {
    return localStorage.getItem(PAIR_KEY) ?? "exalted";
  } catch {
    return "exalted";
  }
}

/** Expanded row under an item: poe.ninja-style price/volume chart per currency pair, with a range slider. */
export function ItemDetail({ name, qty, prices }: { name: string; qty?: number; prices?: PriceTable }) {
  const [history, setHistory] = useState<ItemHistory | { error: string }>();
  const [pairId, setPairId] = useState(loadPair);
  const [range, setRange] = useState<[number, number]>();
  const [big, setBig] = useState(false);
  useEffect(() => {
    let alive = true;
    void api()
      .itemHistory(name)
      .then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [name]);
  const pick = (id: string) => {
    setPairId(id);
    try {
      localStorage.setItem(PAIR_KEY, id);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const perHour = hourlyUnits(name, prices);
  const perDay = perHour != null ? perHour * 24 : undefined;
  const vol = prices?.volumeByName?.[name];
  const pairs = history && "pairs" in history ? [...history.pairs].sort((a, b) => PAIR_ORDER.indexOf(a.id) - PAIR_ORDER.indexOf(b.id)) : [];
  const pair = pairs.find((p) => p.id === pairId) ?? pairs[0];
  const icon = (n: string) => prices?.imageByName?.[n];
  const pairName = pair ? (PAIR_NAME[pair.id] ?? pair.id) : "";

  const hourly = history && "pairs" in history && pair ? history.hourly?.[pair.id] : undefined;
  const allTs = [...(pair?.points ?? []), ...(hourly ?? [])].map((p) => p.ts);
  const t0 = allTs.length ? Math.min(...allTs) : 0;
  const t1 = allTs.length ? Math.max(...allTs) : 0;
  const [rangeLabel, setRangeLabel] = useState<string>();
  const pickRange = (r: (typeof RANGES)[number]) => {
    setRangeLabel(r.label);
    if (!r.ms || t1 <= t0) return setRange([0, 100]);
    setRange([Math.max(0, (1 - r.ms / (t1 - t0)) * 100), 100]);
  };
  const onZoom = (r: [number, number]) => {
    setRangeLabel(undefined);
    setRange(r);
  };
  const chart = (height: number) =>
    pair && <PairChart pair={pair} hourly={hourly} pairIcon={icon(pairName)} itemIcon={icon(name)} height={height} range={range} onZoom={onZoom} />;
  const head = pair && (
    <div className="ninja-head">
      <div className="ninja-pair">
        {icon(pairName) && <img src={icon(pairName)} alt="" />}
        <span>{pairName}</span>
        <span className="swap">⇆</span>
        {icon(name) && <img src={icon(name)} alt="" />}
        <span className="ninja-item">{name}</span>
      </div>
      <div className="ninja-ranges">
        {RANGES.map((r) => (
          <button key={r.label} className={rangeLabel === r.label ? "on" : ""} onClick={() => pickRange(r)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="ninja-tools">
        <button title="Büyüt" onClick={() => setBig(!big)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            {big ? <path d="M6 2v4H2M10 14v-4h4M6 6 1 1M10 10l5 5" /> : <path d="M10 1h5v5M6 15H1v-5M15 1 9 7M1 15l6-6" />}
          </svg>
        </button>
        <button title="Aralığı sıfırla" onClick={() => pickRange(RANGES[RANGES.length - 1]!)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 1.8v2.8h2.8" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="item-detail" onClick={(e) => e.stopPropagation()}>
      {pairs.length > 0 && (
        <div className="ninja-tabs" role="tablist">
          {pairs.map((p) => (
            <button key={p.id} role="tab" aria-selected={p === pair} className={p === pair ? "on" : ""} onClick={() => pick(p.id)}>
              {icon(PAIR_NAME[p.id] ?? "") && <img src={icon(PAIR_NAME[p.id] ?? "")} alt="" />}
              {(PAIR_NAME[p.id] ?? p.id).replace(" Orb", "")}
            </button>
          ))}
        </div>
      )}
      {!history && <p className="muted small">poe.ninja'dan geçmiş alınıyor…</p>}
      {history && "error" in history && <FallbackChart name={name} prices={prices} note={history.error} />}
      {pair && (
        <div className="ninja-card">
          {head}
          <div className="ninja-body">{chart(380)}</div>
        </div>
      )}
      {big && pair && (
        <div className="ninja-modal" onClick={() => setBig(false)}>
          <div className="ninja-card big" onClick={(e) => e.stopPropagation()}>
            {head}
            <div className="ninja-body">{chart(Math.max(420, Math.round(window.innerHeight * 0.7)))}</div>
          </div>
        </div>
      )}
      <div className="item-detail-stats small">
        {perHour != null && vol != null && (
          <span>
            Saatlik işlem <b>~{fmtUnits(perHour)} adet</b> <span className="muted">({fmtDiv(vol)} div)</span>
          </span>
        )}
        {perHour != null && perDay != null && qty && qty / perHour >= 0.05 ? (
          <span className={qty > perDay ? "warn" : "muted"}>
            Senin {qty} adet = saatlik işlemin %{Math.round((qty / perHour) * 100)}
            {qty > perDay ? " · hepsini bir günde satmak fiyatı düşürür" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Offline fallback: the 7-day sparkline that comes with the price list. */
function FallbackChart({ name, prices, note }: { name: string; prices?: PriceTable; note: string }) {
  const [unit, setUnit] = useState<Unit>(loadUnit);
  const series = priceHistory(name, prices, unit);
  return (
    <>
      <div className="item-detail-head">
        <span className="muted small">Son 7 gün · {note}</span>
        <div className="seg">
          {(["div", "chaos"] as Unit[]).map((u) => (
            <button
              key={u}
              className={unit === u ? "on" : ""}
              onClick={() => {
                setUnit(u);
                try {
                  localStorage.setItem(UNIT_KEY, u);
                } catch {
                  /* per-viewer convenience only */
                }
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {series ? <Chart series={series} unit={unit} /> : <p className="muted small">Bu item için fiyat geçmişi yok.</p>}
    </>
  );
}

/** Round tick values (1, 2, 2.5, 5 x 10^n) covering min..max. */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= max + step * 0.999; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Decimals that tell neighbouring ticks apart (step 0.005 -> 3). */
const decimalsFor = (step: number) => {
  let d = 0;
  while (d < 6 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++;
  return d;
};
const fmtNum = (v: number, decimals: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("tr-TR") : v.toFixed(Math.min(decimals, 4)));

/** Line chart drawn at its real pixel width, so text and dots are never stretched. */
function Chart({ series, unit }: { series: number[]; unit: Unit }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 150;
  const pad = { l: 44, r: 14, t: 20, b: 22 };
  const yt = ticks(Math.min(...series), Math.max(...series));
  const lo = yt[0]!;
  const hi = yt[yt.length - 1]!;
  const dec = decimalsFor(Number((yt.length > 1 ? yt[1]! - yt[0]! : Math.abs(hi) || 1).toPrecision(6)));
  const fmtAxis = (v: number) => fmtNum(v, dec);
  const fmtPoint = (v: number) => fmtNum(v, dec + 1);
  // Points sit a little inside the plot so their labels clear the y-axis numbers.
  const inset = 18;
  const x = (i: number) => pad.l + inset + (i * (W - pad.l - pad.r - inset * 2)) / (series.length - 1);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = series[series.length - 1]! >= series[0]!;
  const date = (i: number) => new Date(Date.now() - (series.length - 1 - i) * 86400000);
  const day = (i: number) => (i === series.length - 1 ? "bugün" : date(i).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }));
  // Point labels only when there is room for them.
  const showValues = W / series.length >= 44;
  const isLow = (i: number) => {
    const v = series[i]!;
    const prev = series[i - 1] ?? Infinity;
    const next = series[i + 1] ?? Infinity;
    return v < prev && v < next && y(v) + 15 < H - pad.b;
  };
  return (
    <div ref={ref} className="price-chart-wrap">
      {W > 0 && (
        <svg className={`price-chart ${up ? "up" : "down"}`} width={W} height={H} role="img" aria-label={`7 günlük fiyat grafiği (${unit})`}>
          {yt.map((v) => (
            <g key={v}>
              <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
              <text className="axis" x={pad.l - 6} y={y(v) + 3} textAnchor="end">
                {fmtAxis(v)}
              </text>
            </g>
          ))}
          <text className="axis unit" x={pad.l - 6} y={10} textAnchor="end">
            {unit}
          </text>
          <polygon className="area" points={`${x(0)},${y(lo)} ${pts} ${x(series.length - 1)},${y(lo)}`} />
          <polyline className="line" points={pts} />
          {series.map((v, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r={3}>
                <title>{`${day(i)}: ${fmtUnit(v, unit)}`}</title>
              </circle>
              {showValues && (
                <text className="val" x={x(i)} y={isLow(i) ? y(v) + 15 : y(v) - 7} textAnchor="middle">
                  {fmtPoint(v)}
                </text>
              )}
              <text className="axis" x={x(i)} y={H - 6} textAnchor="middle">
                {day(i)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
