import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { AxisPointerComponent, DataZoomComponent, GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { PricePair } from "../../shared/types";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, AxisPointerComponent, SVGRenderer]);

// poe.ninja's item page palette.
const C = {
  line: "#4cc38a",
  hourly: "#9be3bd",
  bar: "#2f7c7a",
  barLabel: "#3a9a96",
  grid: "#353a44",
  axis: "#c9ccd2",
  axisLine: "#6b7280",
  tipBg: "#1d2027",
  tipBorder: "#3b404a",
  zoomBg: "#2a3040",
  zoomFill: "rgba(120, 140, 190, 0.18)",
};

const NO_POINTS: PricePair["points"] = [];

export const compact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v >= 100 ? String(Math.round(v)) : v >= 1 ? String(Number(v.toFixed(1))) : String(Number(v.toPrecision(2)));

const rateLabel = (v: number) => (v >= 100 ? String(Math.round(v)) : v >= 10 ? String(Number(v.toFixed(1))) : String(Number(v.toPrecision(3))));

const img = (src: string | undefined) => (src ? `<img src="${src}" style="width:22px;height:22px;vertical-align:middle;margin:0 4px" />` : "");

/**
 * Price line with a volume bar chart below and a range slider, laid out like poe.ninja's item page.
 * `range` is the zoom window in % and survives re-renders; the reset button restores the full span.
 */
export function PairChart({
  pair,
  hourly = NO_POINTS,
  pairIcon,
  itemIcon,
  height = 380,
  onZoom,
  range,
}: {
  pair: PricePair;
  /** Our own hourly points for this pair; they show up between poe.ninja's daily ones. */
  hourly?: PricePair["points"];
  pairIcon?: string;
  itemIcon?: string;
  height?: number;
  onZoom?: (r: [number, number]) => void;
  range?: [number, number];
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | undefined>(undefined);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "svg" });
    chart.current = c;
    setWidth(el.current.clientWidth);
    const ro = new ResizeObserver(() => {
      c.resize();
      setWidth(el.current?.clientWidth ?? 0);
    });
    ro.observe(el.current);
    c.on("datazoom", () => {
      const z = (c.getOption() as { dataZoom?: Array<{ start?: number; end?: number }> }).dataZoom?.[0];
      if (z?.start != null && z.end != null) onZoom?.([z.start, z.end]);
    });
    return () => {
      ro.disconnect();
      c.dispose();
    };
    // onZoom is a setter from the parent; binding it once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    // poe.ninja flips a pair whose price is below 1 (e.g. "1.0 div ⇆ 1.4 annul") so the numbers stay readable.
    const sorted = [...pair.points.map((p) => p.rate)].sort((a, b) => a - b);
    const invert = (sorted[Math.floor(sorted.length / 2)] ?? 1) < 1;
    const val = (rate: number) => (invert ? 1 / rate : rate);
    const daily = pair.points.map((p) => [p.ts, val(p.rate)] as [number, number]);
    const hours = hourly.map((p) => [p.ts, val(p.rate)] as [number, number]);
    const vols = pair.points.map((p) => [p.ts, p.volume] as [number, number]);
    const volByTs = new Map(pair.points.map((p) => [p.ts, p.volume]));
    const hourVolByTs = new Map(hourly.map((p) => [p.ts, p.volume]));
    const [start, end] = range ?? [0, 100];
    const t0 = Math.min(...[...daily, ...hours].map((d) => d[0]));
    const t1 = Math.max(...[...daily, ...hours].map((d) => d[0]));
    const spanMs = Math.max(1, ((t1 - t0) * (end - start)) / 100);
    // Label every n-th point so numbers never overlap: ~38px per line label, ~34px per bar label.
    const plot = Math.max(120, width - 70);
    const dayPx = (plot * 86400000) / spanMs;
    const lineEvery = Math.max(1, Math.ceil(38 / dayPx));
    const barEvery = Math.max(1, Math.ceil(34 / dayPx));
    // Zoomed into a few days with our own hourly record: hourly bars instead of daily ones.
    const hourlyBars = hours.length > 0 && spanMs <= 3 * 86400000;
    const slotPx = hourlyBars ? dayPx / 24 : dayPx;
    const barWidth = Math.max(2, Math.min(60, slotPx * 0.68));
    const barEveryHourly = Math.max(1, Math.ceil(34 / slotPx));
    const hourVols = hourly.map((p) => [p.ts, p.volume] as [number, number]);
    const quote = (v: number) =>
      invert
        ? `1.0${img(pairIcon)}<span style="color:${C.line};margin:0 4px">⇆</span>${rateLabel(v)}${img(itemIcon)}`
        : `${rateLabel(v)}${img(pairIcon)}<span style="color:${C.line};margin:0 4px">⇆</span>1.0${img(itemIcon)}`;
    const when = (ts: number) => {
      const d = new Date(ts);
      const day = d.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      return `${day} · ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
    };
    const xAxis = [0, 1].map((i) => ({
      type: "time",
      gridIndex: i,
      min: t0,
      max: t1,
      axisLine: { lineStyle: { color: C.axisLine } },
      axisTick: { show: i === 1 },
      axisLabel: {
        show: i === 0,
        color: C.axis,
        fontSize: 12,
        margin: 12,
        hideOverlap: true,
        // Day number at midnight (bold, like poe.ninja), clock time inside a day.
        formatter: (ts: number) => {
          const d = new Date(ts);
          return d.getHours() === 0 && d.getMinutes() === 0 ? `{day|${d.getDate()}}` : `${String(d.getHours()).padStart(2, "0")}:00`;
        },
        rich: { day: { fontWeight: 700, color: "#e8eaee", fontSize: 12 } },
      },
      splitLine: { show: i === 0, lineStyle: { color: C.grid } },
    }));
    c.setOption(
      {
        animation: false,
        textStyle: { fontFamily: "Inter, system-ui, sans-serif" },
        grid: [
          { left: 52, right: 18, top: 24, height: "52%" },
          { left: 52, right: 18, top: "70%", height: "13%" },
        ],
        xAxis,
        yAxis: [
          {
            gridIndex: 0,
            type: "value",
            scale: true,
            splitNumber: 6,
            axisLabel: { color: C.axis, fontSize: 12, formatter: (v: number) => rateLabel(v) },
            splitLine: { lineStyle: { color: C.grid } },
            axisLine: { show: false },
          },
          { gridIndex: 1, type: "value", show: false },
        ],
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: "#8a8f99", type: "dashed" } },
          backgroundColor: C.tipBg,
          borderColor: C.tipBorder,
          padding: [10, 14],
          textStyle: { color: "#e8eaee", fontSize: 13 },
          formatter: (ps: Array<{ seriesId: string; value: [number, number] }>) => {
            const line = ps.find((p) => p.seriesId === "hourly") ?? ps.find((p) => p.seriesId === "daily");
            if (!line) return "";
            const [ts, v] = line.value;
            const hourlyPoint = line.seriesId === "hourly";
            const vol = hourlyPoint ? hourVolByTs.get(ts) : volByTs.get(ts);
            return `<div style="font-weight:600;margin-bottom:6px">${when(ts)}</div>
              <div style="display:flex;align-items:center">${quote(v)}</div>
              <div style="color:#9aa0aa;margin-top:4px">${hourlyPoint ? "Saatlik kayıt" : "Günlük (poe.ninja)"}${vol != null ? ` · hacim ${compact(vol)} div${hourlyPoint ? "/saat" : ""}` : ""}</div>`;
          },
        },
        dataZoom: [
          { type: "inside", xAxisIndex: [0, 1], start, end },
          {
            type: "slider",
            xAxisIndex: [0, 1],
            start,
            end,
            bottom: 8,
            height: 34,
            backgroundColor: C.zoomBg,
            borderColor: "#3d4557",
            fillerColor: C.zoomFill,
            dataBackground: { lineStyle: { color: "#8b95b0", width: 1 }, areaStyle: { color: "rgba(139,149,176,.25)" } },
            selectedDataBackground: { lineStyle: { color: "#aab4cf" }, areaStyle: { color: "rgba(170,180,207,.3)" } },
            handleStyle: { color: "#0b0d11", borderColor: "#5b6478" },
            moveHandleStyle: { color: "#5b6478" },
            textStyle: { color: C.axis },
            labelFormatter: (ts: number) =>
              new Date(ts).toLocaleString("tr-TR", { day: "numeric", month: "short", ...(spanMs < 3 * 86400000 ? { hour: "2-digit", minute: "2-digit" } : {}) }),
            brushSelect: false,
          },
        ],
        series: [
          {
            id: "daily",
            type: "line",
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: daily,
            symbol: "circle",
            symbolSize: 7,
            z: 3,
            lineStyle: { color: C.line, width: 2 },
            itemStyle: { color: C.line },
            label: {
              show: true,
              position: "bottom",
              color: C.line,
              fontSize: 12,
              formatter: (p: { dataIndex: number; value: [number, number] }) => (p.dataIndex % lineEvery === 0 ? rateLabel(p.value[1]) : ""),
            },
          },
          {
            id: "hourly",
            type: "line",
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: hours,
            symbol: "circle",
            symbolSize: 4,
            z: 2,
            // Our record only exists while the app ran; gaps stay gaps instead of a made-up line.
            connectNulls: false,
            lineStyle: { color: C.hourly, width: 1.5 },
            itemStyle: { color: C.hourly },
          },
          {
            id: "volume",
            type: "bar",
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: hourlyBars ? hourVols : vols,
            barWidth,
            itemStyle: { color: C.bar },
            label: {
              show: true,
              position: "top",
              color: C.barLabel,
              fontSize: 11,
              formatter: (p: { dataIndex: number; value: [number, number] }) =>
                p.dataIndex % (hourlyBars ? barEveryHourly : barEvery) === 0 ? compact(p.value[1]) : "",
            },
          },
        ],
      },
      // Merge, so a slider drag in progress is not reset by the label-density update it triggers.
      { notMerge: false, lazyUpdate: true },
    );
  }, [pair, hourly, pairIcon, itemIcon, range, width]);

  return <div ref={el} className="pair-chart" style={{ height }} />;
}
