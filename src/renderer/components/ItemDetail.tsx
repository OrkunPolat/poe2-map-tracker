import { useLayoutEffect, useRef, useState } from "react";
import type { PriceTable } from "../../shared/types";
import { dailyUnits, priceHistory } from "../../shared/trends";
import { fmtDiv } from "../api";

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
export const fmtCompact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}k` : fmtUnits(n));

export const fmtUnits = (n: number) => (n >= 10 ? Math.round(n).toLocaleString("tr-TR") : n.toFixed(1));

/** Expanded row under an item: 7-day price chart in div or chaos, and how much of it trades per day. */
export function ItemDetail({ name, qty, prices }: { name: string; qty?: number; prices?: PriceTable }) {
  const [unit, setUnit] = useState<Unit>(loadUnit);
  const pick = (u: Unit) => {
    setUnit(u);
    try {
      localStorage.setItem(UNIT_KEY, u);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const series = priceHistory(name, prices, unit);
  const perDay = dailyUnits(name, prices);
  const vol = prices?.volumeByName?.[name];
  return (
    <div className="item-detail">
      <div className="item-detail-head">
        <span className="muted small">Son 7 gün · poe.ninja</span>
        <div className="seg">
          {(["div", "chaos"] as Unit[]).map((u) => (
            <button key={u} className={unit === u ? "on" : ""} onClick={() => pick(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>
      {series ? <Chart series={series} unit={unit} /> : <p className="muted small">Bu item için fiyat geçmişi yok.</p>}
      <div className="item-detail-stats small">
        {series && (
          <span>
            7 gün önce <b>{fmtUnit(series[0]!, unit)}</b> → bugün <b>{fmtUnit(series[series.length - 1]!, unit)}</b>
          </span>
        )}
        {perDay != null && vol != null && (
          <span>
            Günlük işlem <b>~{fmtUnits(perDay)} adet</b> <span className="muted">({fmtDiv(vol)} div)</span>
          </span>
        )}
        {perDay != null && qty && qty / perDay >= 0.01 ? (
          <span className={qty > perDay ? "warn" : "muted"}>
            Senin {qty} adet = günlük işlemin %{Math.round((qty / perDay) * 100)}
            {qty > perDay ? " · hepsini bir günde satmak fiyatı düşürür" : ""}
          </span>
        ) : null}
      </div>
    </div>
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
