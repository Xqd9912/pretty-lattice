import { useMemo, useRef, useState } from "react";

import { BarChart } from "./BarChart";
import { ChartExportButtons, slugify, type CsvColumn } from "./chartExport";
import { Heatmap, type Colormap } from "./Heatmap";
import { LineChart, type LineSeries } from "./LineChart";

const DEFAULT_COLOR = "#111827";
const PALETTE = [
  DEFAULT_COLOR,
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
];

function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? DEFAULT_COLOR;
}

export interface RawSeries {
  label: string;
  x: number[];
  y: number[];
}

function parseBound(text: string): number | undefined {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

function domainFrom(minText: string, maxText: string): [number, number] | undefined {
  const min = parseBound(minText);
  const max = parseBound(maxText);
  if (min === undefined || max === undefined || max <= min) {
    return undefined;
  }
  return [min, max];
}

const NUMBER_INPUT_CLASS =
  "h-6 w-14 rounded border border-border bg-background px-1 text-center font-mono text-[11px]";

export function LineChartCard({
  title,
  series,
  xLabel,
  yLabel,
  variant = "line",
}: {
  title: string;
  series: RawSeries[];
  xLabel: string;
  yLabel: string;
  variant?: "line" | "bar";
}) {
  const [colors, setColors] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [width, setWidth] = useState(1.5);
  const [smooth, setSmooth] = useState(false);
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const cardRef = useRef<HTMLElement>(null);

  const csvColumns = (): CsvColumn[] => {
    if (series.length === 0) {
      return [];
    }
    return [
      { header: xLabel, values: series[0]!.x },
      ...series.map((line) => ({ header: line.label, values: line.y })),
    ];
  };

  const resolved = useMemo<LineSeries[]>(
    () =>
      series
        .filter((line) => !hidden[line.label])
        .map((line, index) => ({
          label: line.label,
          x: line.x,
          y: line.y,
          color: colors[line.label] ?? paletteColor(index),
          width,
        })),
    [series, colors, hidden, width],
  );

  return (
    <section ref={cardRef} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {variant === "line" ? (
            <>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={smooth}
                  className="size-3 accent-foreground"
                  onChange={(event) => setSmooth(event.target.checked)}
                />
                smooth
              </label>
              <label className="flex items-center gap-1">
                width
                <input
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.5}
                  value={width}
                  className="h-1 w-16 accent-foreground"
                  onChange={(event) => setWidth(Number(event.currentTarget.value))}
                />
              </label>
            </>
          ) : null}
          <ChartExportButtons targetRef={cardRef} fileStem={slugify(title)} csvColumns={csvColumns} />
        </div>
      </div>

      {variant === "bar" ? (
        <BarChart series={resolved} xLabel={xLabel} yLabel={yLabel} xDomain={domainFrom(xMin, xMax)} yDomain={domainFrom(yMin, yMax)} />
      ) : (
        <LineChart series={resolved} xLabel={xLabel} yLabel={yLabel} xDomain={domainFrom(xMin, xMax)} yDomain={domainFrom(yMin, yMax)} smooth={smooth} />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          x
          <input aria-label={`${title} x min`} placeholder="auto" value={xMin} className={NUMBER_INPUT_CLASS} onChange={(e) => setXMin(e.target.value)} />
          <input aria-label={`${title} x max`} placeholder="auto" value={xMax} className={NUMBER_INPUT_CLASS} onChange={(e) => setXMax(e.target.value)} />
        </span>
        <span className="flex items-center gap-1">
          y
          <input aria-label={`${title} y min`} placeholder="auto" value={yMin} className={NUMBER_INPUT_CLASS} onChange={(e) => setYMin(e.target.value)} />
          <input aria-label={`${title} y max`} placeholder="auto" value={yMax} className={NUMBER_INPUT_CLASS} onChange={(e) => setYMax(e.target.value)} />
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {series.map((line, index) => {
          const color = colors[line.label] ?? paletteColor(index);
          return (
            <label key={line.label} className="flex items-center gap-1 text-[11px] text-foreground">
              <input
                type="checkbox"
                checked={!hidden[line.label]}
                className="size-3 accent-foreground"
                onChange={(event) =>
                  setHidden((current) => ({ ...current, [line.label]: !event.target.checked }))
                }
              />
              <input
                type="color"
                aria-label={`${line.label} color`}
                value={color}
                className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0"
                onChange={(event) =>
                  setColors((current) => ({ ...current, [line.label]: event.target.value }))
                }
              />
              {line.label}
            </label>
          );
        })}
      </div>
    </section>
  );
}

export function HeatmapCard({
  title,
  matrix,
  axis,
  xLabel,
  yLabel,
}: {
  title: string;
  matrix: number[][];
  axis: number[];
  xLabel: string;
  yLabel: string;
}) {
  const [colormap, setColormap] = useState<Colormap>("viridis");
  const [vmax, setVmax] = useState("");
  const cardRef = useRef<HTMLElement>(null);

  const csvColumns = (): CsvColumn[] => [
    { header: `${yLabel} \\ ${xLabel}`, values: axis },
    ...axis.map((columnValue, columnIndex) => ({
      header: String(columnValue),
      values: matrix.map((row) => row[columnIndex] ?? ""),
    })),
  ];

  return (
    <section ref={cardRef} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-1">
            colormap
            <select
              value={colormap}
              className="h-6 rounded border border-border bg-background px-1 text-[11px]"
              onChange={(event) => setColormap(event.currentTarget.value as Colormap)}
            >
              <option value="viridis">viridis</option>
              <option value="magma">magma</option>
              <option value="gray">gray</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            max
            <input
              aria-label="colorbar max"
              placeholder="auto"
              value={vmax}
              className={NUMBER_INPUT_CLASS}
              onChange={(event) => setVmax(event.target.value)}
            />
          </label>
          <ChartExportButtons targetRef={cardRef} fileStem={slugify(title)} csvColumns={csvColumns} />
        </div>
      </div>
      <Heatmap matrix={matrix} axis={axis} colormap={colormap} vmax={parseBound(vmax) ?? null} xLabel={xLabel} yLabel={yLabel} />
    </section>
  );
}
