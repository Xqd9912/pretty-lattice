import { useMemo } from "react";

import { niceTicks } from "../analysis/chartMath";

const WIDTH = 380;
const HEIGHT = 240;
const MARGIN = { top: 10, right: 48, bottom: 34, left: 48 };

interface DosIprChartProps {
  dosEnergy: number[];
  dosTotal: number[];
  iprEnergy: number[];
  iprValue: number[];
  dosColor: string;
  iprColor: string;
  dosWidth: number;
  barWidth: number;
  xDomain?: [number, number];
  dosDomain?: [number, number];
  iprDomain?: [number, number];
  showFermi?: boolean;
}

/**
 * Total DOS (line, left axis) and per-state IPR (thin bars, right axis) sharing
 * the energy axis. Energies are relative to the Fermi level (0 eV). Axis ranges,
 * line/bar thickness and colors are all caller-controlled.
 */
export function DosIprChart({
  dosEnergy,
  dosTotal,
  iprEnergy,
  iprValue,
  dosColor,
  iprColor,
  dosWidth,
  barWidth,
  xDomain,
  dosDomain,
  iprDomain,
  showFermi = true,
}: DosIprChartProps) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { dx, dyDos, dyIpr } = useMemo<{
    dx: [number, number];
    dyDos: [number, number];
    dyIpr: [number, number];
  }>(() => {
    const energies = [...dosEnergy, ...iprEnergy].filter((value) => Number.isFinite(value));
    const dxAuto: [number, number] = [
      energies.length ? Math.min(...energies) : 0,
      energies.length ? Math.max(...energies) : 1,
    ];
    const dosPeak = dosTotal.reduce((peak, value) => (value > peak ? value : peak), 0) || 1;
    const iprPeak = iprValue.reduce((peak, value) => (value > peak ? value : peak), 0) || 1;
    return {
      dx: xDomain ?? dxAuto,
      dyDos: dosDomain ?? [0, dosPeak],
      dyIpr: iprDomain ?? [0, iprPeak],
    };
  }, [dosEnergy, dosTotal, iprEnergy, iprValue, xDomain, dosDomain, iprDomain]);

  const spanX = dx[1] - dx[0] || 1;
  const spanDos = dyDos[1] - dyDos[0] || 1;
  const spanIpr = dyIpr[1] - dyIpr[0] || 1;
  const scaleX = (value: number) => MARGIN.left + ((value - dx[0]) / spanX) * plotWidth;
  const scaleDos = (value: number) =>
    MARGIN.top + plotHeight - ((value - dyDos[0]) / spanDos) * plotHeight;
  const scaleIpr = (value: number) =>
    MARGIN.top + plotHeight - ((value - dyIpr[0]) / spanIpr) * plotHeight;

  const xTicks = niceTicks(dx[0], dx[1]);
  const dosTicks = niceTicks(dyDos[0], dyDos[1]);
  const iprTicks = niceTicks(dyIpr[0], dyIpr[1]);

  const dosPath =
    dosEnergy.length > 0
      ? `M ${scaleX(dosEnergy[0]!)},${scaleDos(dosTotal[0] ?? 0)} ` +
        dosEnergy
          .slice(1)
          .map((energy, index) => `L ${scaleX(energy)},${scaleDos(dosTotal[index + 1] ?? 0)}`)
          .join(" ")
      : "";

  const baseline = MARGIN.top + plotHeight;
  const inRange = (value: number) => value >= dx[0] && value <= dx[1];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="plot-chart w-full" role="img" aria-label="DOS and IPR vs energy">
      <clipPath id="dosipr-clip">
        <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} />
      </clipPath>

      {dosTicks.map((tick) => (
        <g key={`d${tick}`}>
          <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={scaleDos(tick)} y2={scaleDos(tick)} stroke="currentColor" strokeOpacity={0.07} />
          <text x={MARGIN.left - 6} y={scaleDos(tick)} textAnchor="end" dominantBaseline="middle" className="text-[9px]">
            {tick}
          </text>
        </g>
      ))}
      {iprTicks.map((tick) => (
        <text key={`i${tick}`} x={MARGIN.left + plotWidth + 6} y={scaleIpr(tick)} textAnchor="start" dominantBaseline="middle" className="text-[9px]">
          {tick}
        </text>
      ))}
      {xTicks.map((tick) => (
        <text key={`x${tick}`} x={scaleX(tick)} y={HEIGHT - MARGIN.bottom + 14} textAnchor="middle" className="text-[9px]">
          {tick}
        </text>
      ))}

      <g clipPath="url(#dosipr-clip)">
        {/* IPR bars (drawn under the DOS line). */}
        {iprEnergy.map((energy, index) => {
          if (!inRange(energy)) {
            return null;
          }
          const value = iprValue[index] ?? 0;
          const top = scaleIpr(value);
          return (
            <rect
              key={index}
              x={scaleX(energy) - barWidth / 2}
              y={top}
              width={barWidth}
              height={Math.max(0, baseline - top)}
              fill={iprColor}
              fillOpacity={0.75}
            />
          );
        })}

        {showFermi && inRange(0) ? (
          <line x1={scaleX(0)} x2={scaleX(0)} y1={MARGIN.top} y2={baseline} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />
        ) : null}

        <path fill="none" stroke={dosColor} strokeWidth={dosWidth} strokeLinejoin="round" d={dosPath} />
      </g>

      <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={baseline} y2={baseline} stroke="currentColor" strokeOpacity={0.25} />
      <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={baseline} stroke="currentColor" strokeOpacity={0.25} />
      <line x1={MARGIN.left + plotWidth} x2={MARGIN.left + plotWidth} y1={MARGIN.top} y2={baseline} stroke="currentColor" strokeOpacity={0.25} />

      <text x={MARGIN.left + plotWidth / 2} y={HEIGHT - 2} textAnchor="middle" className="text-[10px]">
        E − E_f (eV)
      </text>
      <text x={12} y={MARGIN.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 12 ${MARGIN.top + plotHeight / 2})`} className="text-[10px]">
        DOS
      </text>
      <text x={WIDTH - 8} y={MARGIN.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 ${WIDTH - 8} ${MARGIN.top + plotHeight / 2})`} className="text-[10px]">
        IPR
      </text>
    </svg>
  );
}
