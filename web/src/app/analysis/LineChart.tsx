import { useId, useMemo } from "react";

import { CHART_MARGIN as MARGIN, CHART_WIDTH, minMax, niceTicks } from "./chartMath";

export interface LineSeries {
  label: string;
  x: number[];
  y: number[];
  color: string;
  width: number;
}

interface LineChartProps {
  series: LineSeries[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  smooth?: boolean;
}

interface Point {
  x: number;
  y: number;
}

// Build an SVG path through the points; when `smooth`, use a Catmull-Rom spline
// converted to cubic Béziers so the curve passes through every data point.
function buildPath(points: Point[], smooth: boolean): string {
  if (points.length === 0) {
    return "";
  }
  const first = points[0]!;
  if (points.length < 3 || !smooth) {
    return `M ${first.x},${first.y} ` + points.slice(1).map((p) => `L ${p.x},${p.y}`).join(" ");
  }
  let d = `M ${first.x},${first.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function LineChart({
  series,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  height = 220,
  smooth = false,
}: LineChartProps) {
  const clipId = useId();
  const width = CHART_WIDTH;
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const domains = useMemo(() => {
    const withData = series.filter((line) => line.x.length > 0);
    const [xLo, xHi] = minMax(withData.map((line) => line.x));
    const [yLo, yHi] = minMax(withData.map((line) => line.y));
    const dx: [number, number] = xDomain ?? [
      Number.isFinite(xLo) ? xLo : 0,
      Number.isFinite(xHi) ? xHi : 1,
    ];
    const dy: [number, number] = yDomain ?? [
      Math.min(0, Number.isFinite(yLo) ? yLo : 0),
      (Number.isFinite(yHi) ? yHi : 0) * 1.05 || 1,
    ];
    return { dx, dy };
  }, [series, xDomain, yDomain]);

  const { dx, dy } = domains;
  const spanX = dx[1] - dx[0] || 1;
  const spanY = dy[1] - dy[0] || 1;
  const scaleX = (value: number) => MARGIN.left + ((value - dx[0]) / spanX) * plotWidth;
  const scaleY = (value: number) => MARGIN.top + plotHeight - ((value - dy[0]) / spanY) * plotHeight;

  const xTicks = niceTicks(dx[0], dx[1]);
  const yTicks = niceTicks(dy[0], dy[1]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="plot-chart w-full"
      role="img"
      aria-label={`${yLabel ?? "value"} vs ${xLabel ?? "x"}`}
    >
      <clipPath id={clipId}>
        <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} />
      </clipPath>

      {yTicks.map((tick) => (
        <g key={`y${tick}`}>
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotWidth}
            y1={scaleY(tick)}
            y2={scaleY(tick)}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
          <text x={MARGIN.left - 6} y={scaleY(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
            {tick}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <text key={`x${tick}`} x={scaleX(tick)} y={height - MARGIN.bottom + 14} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          {tick}
        </text>
      ))}

      <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={MARGIN.top + plotHeight} y2={MARGIN.top + plotHeight} stroke="currentColor" strokeOpacity={0.25} />
      <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="currentColor" strokeOpacity={0.25} />

      <g clipPath={`url(#${clipId})`}>
        {series.map((line) => (
          <path
            key={line.label}
            fill="none"
            stroke={line.color}
            strokeWidth={line.width}
            strokeLinejoin="round"
            d={buildPath(
              line.x.map((value, index) => ({ x: scaleX(value), y: scaleY(line.y[index] ?? 0) })),
              smooth,
            )}
          />
        ))}
      </g>

      {xLabel ? (
        <text x={MARGIN.left + plotWidth / 2} y={height - 2} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {xLabel}
        </text>
      ) : null}
      {yLabel ? (
        <text x={10} y={MARGIN.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 10 ${MARGIN.top + plotHeight / 2})`} className="fill-muted-foreground text-[10px]">
          {yLabel}
        </text>
      ) : null}
    </svg>
  );
}
