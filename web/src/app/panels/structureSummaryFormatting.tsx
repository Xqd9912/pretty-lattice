import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { renderHermannMauguin } from "../symmetryNotation";

export function SummaryRow({
  label,
  mono = true,
  title,
  value,
  valueClassName,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-2 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span title={title}>
        <span
          className={cn(
            "block truncate font-normal leading-snug tabular-nums",
            mono ? "font-mono" : "font-sans",
            valueClassName,
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

export function SymmetryMetric({
  label,
  mono = false,
  title,
  value,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-baseline gap-2">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate font-normal leading-snug tabular-nums",
          mono ? "font-mono" : "font-sans",
        )}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

export function renderSpaceGroup(spaceGroup: string | null, spaceGroupNumber: number | null) {
  const symbol = spaceGroup ?? "-";
  if (spaceGroupNumber === null) {
    return renderHermannMauguin(symbol);
  }

  return (
    <>
      {renderHermannMauguin(symbol)}
      <span className="ml-1">(No. {spaceGroupNumber})</span>
    </>
  );
}

export function formatSpaceGroupTitle(spaceGroup: string | null, spaceGroupNumber: number | null) {
  const symbol = spaceGroup ?? "-";
  return spaceGroupNumber === null ? symbol : `${symbol}  (No. ${spaceGroupNumber})`;
}

export function renderPointGroup(pointGroup: string | null, schoenflies: string | null) {
  const symbol = pointGroup ?? "-";
  if (!schoenflies) {
    return renderHermannMauguin(symbol);
  }

  return (
    <>
      {renderHermannMauguin(symbol)}
      <span className="ml-1">(</span>
      {renderSchoenflies(schoenflies)}
      <span>)</span>
    </>
  );
}

export function formatPointGroupTitle(pointGroup: string | null, schoenflies: string | null) {
  const symbol = pointGroup ?? "-";
  return schoenflies ? `${symbol}  (${schoenflies})` : symbol;
}

export function renderFormula(formula: string) {
  return formula.split(/(\d+)/).map((part, index) =>
    /^\d+$/.test(part) ? (
      <sub key={`${part}-${index}`} className="text-[0.68em] leading-none">
        {part}
      </sub>
    ) : (
      part
    ),
  );
}

export function CellMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="shrink-0 text-[0.78rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate tabular-nums">
        {value}
        {unit === "Å" ? "\u2009" : ""}
        {unit}
      </dd>
    </div>
  );
}

function renderSchoenflies(symbol: string) {
  if (symbol.length <= 1) {
    return symbol;
  }

  return (
    <>
      {symbol.slice(0, 1)}
      <sub className="text-[0.68em] leading-none">{symbol.slice(1)}</sub>
    </>
  );
}
