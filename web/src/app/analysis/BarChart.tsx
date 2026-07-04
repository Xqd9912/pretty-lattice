import { CHART_MARGIN as MARGIN, CHART_WIDTH, minMax, niceTicks } from "./chartMath";
import type { LineSeries } from "./LineChart";

interface BarChartProps {
  series: LineSeries[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  height?: number;
}

/**
 * Grouped bar chart for categorical x (e.g. coordination number). All series
 * are assumed to share the same x categories (the first series defines them).
 * `xDomain` limits which categories are shown.
 */
export function BarChart({ series, xDomain, yDomain, xLabel, yLabel, height = 220 }: BarChartProps) {
  const width = CHART_WIDTH;
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const allCategories = series[0]?.x ?? [];
  const [xLo, xHi] = xDomain ?? [-Infinity, Infinity];
  const shown = allCategories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => category >= xLo && category <= xHi);
  const [, yHi] = minMax(series.map((line) => line.y));
  const dy: [number, number] = yDomain ?? [0, (Number.isFinite(yHi) ? yHi : 0) * 1.05 || 1];
  const spanY = dy[1] - dy[0] || 1;
  const scaleY = (value: number) => MARGIN.top + plotHeight - ((value - dy[0]) / spanY) * plotHeight;

  const yTicks = niceTicks(dy[0], dy[1]);
  const n = shown.length;
  const groupWidth = n > 0 ? plotWidth / n : plotWidth;
  const groupPadding = groupWidth * 0.2;
  const seriesCount = Math.max(1, series.length);
  const barWidth = (groupWidth - groupPadding) / seriesCount;

  // Label at most ~12 categories to avoid crowding.
  const labelEvery = Math.max(1, Math.ceil(n / 12));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="plot-chart w-full" role="img" aria-label={`${yLabel ?? "value"} by ${xLabel ?? "category"}`}>
      {yTicks.map((tick) => (
        <g key={`y${tick}`}>
          <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={scaleY(tick)} y2={scaleY(tick)} stroke="currentColor" strokeOpacity={0.08} />
          <text x={MARGIN.left - 6} y={scaleY(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
            {tick}
          </text>
        </g>
      ))}

      <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={MARGIN.top + plotHeight} y2={MARGIN.top + plotHeight} stroke="currentColor" strokeOpacity={0.25} />
      <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="currentColor" strokeOpacity={0.25} />

      {shown.map(({ category, index: categoryIndex }, position) => {
        const groupX = MARGIN.left + position * groupWidth + groupPadding / 2;
        return (
          <g key={`c${category}-${categoryIndex}`}>
            {series.map((line, seriesIndex) => {
              const value = line.y[categoryIndex] ?? 0;
              const top = scaleY(Math.max(dy[0], value));
              const barHeight = Math.max(0, MARGIN.top + plotHeight - top);
              return (
                <rect
                  key={line.label}
                  x={groupX + seriesIndex * barWidth}
                  y={top}
                  width={Math.max(0.5, barWidth - 0.5)}
                  height={barHeight}
                  fill={line.color}
                />
              );
            })}
            {position % labelEvery === 0 ? (
              <text x={groupX + (groupWidth - groupPadding) / 2} y={height - MARGIN.bottom + 14} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                {category}
              </text>
            ) : null}
          </g>
        );
      })}

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
