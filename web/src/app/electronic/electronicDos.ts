import type { ElectronicDosSeries } from "../../api/electronic";

export function electronicDosDisplayValues(
  series: Pick<ElectronicDosSeries, "kind" | "spin" | "values">,
  normalization: "sum" | "average",
  atomCount: number,
): number[] {
  return series.values.map((value) => {
    const normalized = normalization === "average" && series.kind === "site-group"
      ? value / Math.max(1, atomCount)
      : value;
    return series.spin === "down" ? -Math.abs(normalized) : normalized;
  });
}

export function electronicDosDomain(
  minimumText: string,
  maximumText: string,
): [number, number] | undefined {
  const minimum = Number.parseFloat(minimumText);
  const maximum = Number.parseFloat(maximumText);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
    return undefined;
  }
  return [minimum, maximum];
}

export function isElectronicDosSeriesValid(
  series: Pick<ElectronicDosSeries, "values">,
  energyPointCount: number,
): boolean {
  return Array.isArray(series.values)
    && series.values.length === energyPointCount
    && series.values.every(Number.isFinite);
}
