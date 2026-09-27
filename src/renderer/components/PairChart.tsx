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
  pairIcon,
  itemIcon,
  height = 380,
  onZoom,
  range,
}: {
  pair: PricePair;
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
    const days = pair.points.map((p) => new Date(p.ts));
    const rates = pair.points.map((p) => p.rate);
    const vols = pair.points.map((p) => p.volume);
    const [start, end] = range ?? [0, 100];
    // Label every n-th point so numbers never overlap: ~38px per line label, ~34px per bar label.
    const visible = Math.max(2, Math.round((pair.points.length * (end - start)) / 100));
    const plot = Math.max(120, width - 70);
    const every = (px: number) => Math.max(1, Math.ceil((visible * px) / plot));
    const lineEvery = Math.max(2, every(38));
    const barEvery = every(34);
    c.setOption(
      {
        animation: false,
        textStyle: { fontFamily: "Inter, system-ui, sans-serif" },
        grid: [
          { left: 52, right: 18, top: 24, height: "52%" },
          { left: 52, right: 18, top: "70%", height: "13%" },
        ],
        xAxis: [0, 1].map((i) => ({
          type: "category",
          gridIndex: i,
          data: days.map((d) => d.getDate()),
          boundaryGap: false,
          axisLine: { lineStyle: { color: C.axisLine } },
          axisTick: { show: i === 1, alignWithLabel: true },
          axisLabel: { show: i === 0, color: C.axis, fontSize: 12, margin: 12 },
          splitLine: { show: i === 0, lineStyle: { color: C.grid } },
        })),
        yAxis: [
          {
            gridIndex: 0,
            type: "value",
            min: 0,
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
          formatter: (ps: Array<{ dataIndex: number }>) => {
            const i = ps[0]?.dataIndex ?? 0;
            const d = days[i]!;
            const date = d.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
            return `<div style="font-weight:600;margin-bottom:6px">${date}</div>
              <div style="display:flex;align-items:center">${rateLabel(rates[i]!)}${img(pairIcon)}<span style="color:${C.line};margin:0 4px">⇆</span>1.0${img(itemIcon)}</div>
              <div style="color:#9aa0aa;margin-top:4px">Hacim ${compact(vols[i]!)} div</div>`;
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
            labelFormatter: (i: number) => (days[i] ? days[i]!.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : ""),
            brushSelect: false,
          },
        ],
        series: [
          {
            type: "line",
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: rates,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { color: C.line, width: 2 },
            itemStyle: { color: C.line },
            label: {
              show: true,
              position: "bottom",
              color: C.line,
              fontSize: 12,
              // Every other point, like poe.ninja, so labels do not collide.
              formatter: (p: { dataIndex: number; value: number }) => (p.dataIndex % lineEvery === 0 ? rateLabel(p.value) : ""),
            },
          },
          {
            type: "bar",
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: vols,
            barWidth: "68%",
            itemStyle: { color: C.bar },
            label: { show: true, position: "top", color: C.barLabel, fontSize: 11, formatter: (p: { dataIndex: number; value: number }) => (p.dataIndex % barEvery === 0 ? compact(p.value) : "") },
          },
        ],
      },
      // Merge, so a slider drag in progress is not reset by the label-density update it triggers.
      { notMerge: false, lazyUpdate: true },
    );
  }, [pair, pairIcon, itemIcon, range, width]);

  return <div ref={el} className="pair-chart" style={{ height }} />;
}
