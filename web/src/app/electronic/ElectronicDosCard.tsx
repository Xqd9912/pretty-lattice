import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  fetchVasprunSitePdos,
  type ElectronicCapability,
  type ElectronicDosSeries,
  type SitePdosResponse,
} from "../../api/electronic";
import { LineChart } from "../analysis/LineChart";
import { ChartExportButtons, type CsvColumn } from "../analysis/chartExport";
import {
  electronicDosDisplayValues,
  electronicDosDomain,
  isElectronicDosSeriesValid,
} from "./electronicDos";

const SERIES_COLORS = [
  "#111827",
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
];

const NUMBER_INPUT_CLASS =
  "h-6 w-14 rounded border border-border bg-background px-1 text-center font-mono text-[11px]";

export function ElectronicDosCard({
  electronicId,
  energy,
  series,
  selectedSiteIndices = new Set(),
  sitePdosCapability,
  onError,
}: {
  electronicId?: string;
  energy: number[];
  series: readonly ElectronicDosSeries[];
  selectedSiteIndices?: ReadonlySet<number>;
  sitePdosCapability?: ElectronicCapability;
  onError?: (message: string | null) => void;
}) {
  const [showDos, setShowDos] = useState(true);
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(
    () => new Set(series.filter((entry) => entry.kind === "tdos").map((entry) => entry.id)),
  );
  const [sitePdos, setSitePdos] = useState<SitePdosResponse | null>(null);
  const [normalization, setNormalization] = useState<"sum" | "average">("sum");
  const [loadingSites, setLoadingSites] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const cardRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setSitePdos(null);
    setSiteError(null);
    setNormalization("sum");
    setXMin("");
    setXMax("");
    setYMin("");
    setYMax("");
    setVisibleIds(
      new Set(series.filter((entry) => entry.kind === "tdos").map((entry) => entry.id)),
    );
  }, [electronicId]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const allSeries = useMemo(
    () => [...series, ...(sitePdos?.series ?? [])],
    [series, sitePdos],
  );
  const validSeries = useMemo(
    () => allSeries.filter((entry) => isElectronicDosSeriesValid(entry, energy.length)),
    [allSeries, energy.length],
  );
  const invalidSeriesCount = allSeries.length - validSeries.length;
  const plotted = useMemo(
    () => validSeries.filter((entry) => visibleIds.has(entry.id)).map((entry, index) => ({
      label: entry.label,
      x: energy,
      y: electronicDosDisplayValues(entry, normalization, sitePdos?.atomCount ?? 1),
      color: SERIES_COLORS[index % SERIES_COLORS.length]!,
      width: 1.5,
    })),
    [energy, normalization, sitePdos?.atomCount, validSeries, visibleIds],
  );
  const selectedSnapshot = [...selectedSiteIndices].sort((left, right) => left - right);

  const csvColumns = (): CsvColumn[] => showDos && plotted.length > 0
    ? [
        { header: "energy (eV)", values: energy },
        ...plotted.map((entry) => ({ header: entry.label, values: entry.y })),
      ]
    : [];

  const loadSelectedSites = async () => {
    if (!electronicId || selectedSnapshot.length === 0) {
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadingSites(true);
    setSiteError(null);
    onError?.(null);
    try {
      const response = await fetchVasprunSitePdos(
        electronicId,
        selectedSnapshot,
        controller.signal,
      );
      setSitePdos(response);
      setVisibleIds((current) => {
        const next = new Set(current);
        for (const entry of response.series) {
          if (entry.orbital === "total") {
            next.add(entry.id);
          }
        }
        return next;
      });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        return;
      }
      const message = caught instanceof Error ? caught.message : "Site PDOS load failed.";
      setSiteError(message);
      onError?.(message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoadingSites(false);
      }
    }
  };

  return (
    <section
      ref={cardRef}
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <input
            type="checkbox"
            checked={showDos}
            className="size-3 accent-foreground"
            onChange={(event) => setShowDos(event.currentTarget.checked)}
          />
          DOS / PDOS
        </label>
        <ChartExportButtons
          targetRef={cardRef}
          fileStem="dos-pdos"
          csvColumns={csvColumns}
        />
      </div>

      {showDos ? (
        <>
          <LineChart
            series={plotted}
            xLabel="E − E_f (eV)"
            yLabel="DOS"
            height={240}
            xDomain={electronicDosDomain(xMin, xMax)}
            yDomain={electronicDosDomain(yMin, yMax)}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              x
              <input
                aria-label="DOS / PDOS x min"
                placeholder="auto"
                value={xMin}
                className={NUMBER_INPUT_CLASS}
                onChange={(event) => setXMin(event.currentTarget.value)}
              />
              <input
                aria-label="DOS / PDOS x max"
                placeholder="auto"
                value={xMax}
                className={NUMBER_INPUT_CLASS}
                onChange={(event) => setXMax(event.currentTarget.value)}
              />
            </span>
            <span className="flex items-center gap-1">
              y
              <input
                aria-label="DOS / PDOS y min"
                placeholder="auto"
                value={yMin}
                className={NUMBER_INPUT_CLASS}
                onChange={(event) => setYMin(event.currentTarget.value)}
              />
              <input
                aria-label="DOS / PDOS y max"
                placeholder="auto"
                value={yMax}
                className={NUMBER_INPUT_CLASS}
                onChange={(event) => setYMax(event.currentTarget.value)}
              />
            </span>
          </div>
          <details className="rounded-md border border-border px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              Series · {visibleIds.size} visible
            </summary>
            <div className="mt-1.5 max-h-40 overflow-y-auto">
              {validSeries.map((entry) => (
                <label
                  key={entry.id}
                  className="flex items-center gap-2 py-0.5 text-[10px] text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={visibleIds.has(entry.id)}
                    className="size-3 accent-foreground"
                    onChange={(event) => {
                      // React clears currentTarget after the handler returns, so
                      // capture the primitive before entering a state updater.
                      const checked = event.currentTarget.checked;
                      setVisibleIds((current) => {
                      const next = new Set(current);
                      if (checked) {
                        next.add(entry.id);
                      } else {
                        next.delete(entry.id);
                      }
                      return next;
                      });
                    }}
                  />
                  <span>{entry.label}</span>
                </label>
              ))}
            </div>
          </details>
          {invalidSeriesCount > 0 ? (
            <p role="alert" className="text-[10px] text-amber-700">
              {invalidSeriesCount} DOS series were hidden because their data length or values are invalid.
            </p>
          ) : null}

          {electronicId ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    loadingSites
                    || selectedSnapshot.length === 0
                    || !sitePdosCapability?.available
                  }
                  onClick={() => void loadSelectedSites()}
                >
                  {sitePdos ? "Replace from Select" : "Add selected atoms"}
                </Button>
                {sitePdos ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setVisibleIds((current) => new Set(
                        [...current].filter((id) => !id.startsWith("selected:")),
                      ));
                      setSitePdos(null);
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
                <span className="text-[10px] text-muted-foreground">
                  {loadingSites
                    ? "Loading selected-atom PDOS…"
                    : `${selectedSnapshot.length} currently selected`}
                </span>
              </div>
              {sitePdos ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <span>
                    Selected atoms ({sitePdos.atomCount}) · #
                    {sitePdos.siteIndices.map((value) => value + 1).join(", #")}
                  </span>
                  <div role="group" aria-label="Selected atom PDOS normalization">
                    <button
                      type="button"
                      aria-pressed={normalization === "sum"}
                      className={`rounded-l border px-2 py-1 ${normalization === "sum" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                      onClick={() => setNormalization("sum")}
                    >
                      Sum
                    </button>
                    <button
                      type="button"
                      aria-pressed={normalization === "average"}
                      className={`rounded-r border border-l-0 px-2 py-1 ${normalization === "average" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                      onClick={() => setNormalization("average")}
                    >
                      Average
                    </button>
                  </div>
                </div>
              ) : null}
              {!sitePdosCapability?.available && sitePdosCapability?.reason ? (
                <p className="text-[10px] text-amber-700">{sitePdosCapability.reason}</p>
              ) : null}
              {siteError ? <p role="alert" className="text-[10px] text-red-600">{siteError}</p> : null}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              TDOS.dat contains total DOS only; atom and orbital PDOS require vasprun.xml.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
