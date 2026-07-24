import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download } from "lucide-react";

import {
  fetchIprStateContributions,
  type IprResponse,
  type IprStateContributions,
} from "../../api/electronic";
import { Button } from "@/components/ui/button";
import { ChartExportButtons, downloadCsv, type CsvColumn } from "../analysis/chartExport";
import { DosIprChart } from "./DosIprChart";
import {
  IPR_CONTRIBUTION_LIST_HEIGHT_PX,
  IPR_CONTRIBUTION_ROW_HEIGHT_PX,
  IprContributionCache,
  iprCriterionSignature,
  selectIprCluster,
  virtualIprContributionWindow,
  type IprClusterCriterion,
} from "./iprSelection";

const NUMBER_INPUT_CLASS =
  "h-6 w-14 rounded border border-border bg-background px-1 text-center font-mono text-[11px]";

type ContributionStatus = "idle" | "loading" | "ready" | "error";

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

function caughtMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Atom contributions could not be loaded.";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

export interface DosIprCardProps {
  ipr: IprResponse;
  fetchContributions?: typeof fetchIprStateContributions;
  onApplyToStructure: (siteIndices: readonly number[]) => void;
  onClearFromStructure: () => void;
  onColorStructure?: (values: ReadonlyMap<number, number> | null) => void;
  structureSelectedOnly?: boolean;
  structureSelectedSiteIndices?: ReadonlySet<number>;
  structureVisibleSiteIndices?: ReadonlySet<number>;
}

export function DosIprCard({
  ipr,
  fetchContributions = fetchIprStateContributions,
  onApplyToStructure,
  onClearFromStructure,
  onColorStructure,
  structureSelectedOnly,
  structureSelectedSiteIndices,
  structureVisibleSiteIndices,
}: DosIprCardProps) {
  const [dosColor, setDosColor] = useState("#2563eb");
  const [iprColor, setIprColor] = useState("#dc2626");
  const [dosWidth, setDosWidth] = useState(1.5);
  const [barWidth, setBarWidth] = useState(0.6);
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [dosMin, setDosMin] = useState("");
  const [dosMax, setDosMax] = useState("");
  const [iprMin, setIprMin] = useState("");
  const [iprMax, setIprMax] = useState("");
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [contributionStatus, setContributionStatus] = useState<ContributionStatus>("idle");
  const [contributionData, setContributionData] = useState<IprStateContributions | null>(null);
  const [contributionError, setContributionError] = useState<string | null>(null);
  const [contributionRetryVersion, setContributionRetryVersion] = useState(0);
  const [criterionMode, setCriterionMode] = useState<"composition" | "top-k">("composition");
  const [thresholdPercent, setThresholdPercent] = useState(90);
  const [topK, setTopK] = useState(10);
  const [appliedSignature, setAppliedSignature] = useState<string | null>(null);
  const [appliedSiteIndicesSignature, setAppliedSiteIndicesSignature] = useState<
    string | null
  >(null);
  const [scrollTop, setScrollTop] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const contributionCacheRef = useRef(
    new IprContributionCache<IprStateContributions>(),
  );
  const contributionRequestRef = useRef(0);

  useEffect(() => {
    contributionCacheRef.current.clear();
    setSelectedStateId(null);
    setContributionStatus("idle");
    setContributionData(null);
    setContributionError(null);
    setContributionRetryVersion(0);
    setCriterionMode("composition");
    setThresholdPercent(90);
    setTopK(10);
    setAppliedSignature(null);
    setAppliedSiteIndicesSignature(null);
    setScrollTop(0);
  }, [ipr.iprId]);

  useEffect(() => {
    if (!selectedStateId) {
      setContributionStatus("idle");
      setContributionData(null);
      setContributionError(null);
      return;
    }

    setScrollTop(0);
    const cached = contributionCacheRef.current.get(selectedStateId);
    if (cached) {
      setContributionData(cached);
      setContributionStatus("ready");
      setContributionError(null);
      return;
    }

    const controller = new AbortController();
    const requestId = contributionRequestRef.current + 1;
    contributionRequestRef.current = requestId;
    setContributionData(null);
    setContributionStatus("loading");
    setContributionError(null);
    void fetchContributions(ipr.iprId, selectedStateId, controller.signal)
      .then((data) => {
        contributionCacheRef.current.set(selectedStateId, data);
        if (contributionRequestRef.current !== requestId) {
          return;
        }
        setContributionData(data);
        setContributionStatus("ready");
      })
      .catch((caught: unknown) => {
        if (
          contributionRequestRef.current !== requestId ||
          (caught instanceof Error && caught.name === "AbortError")
        ) {
          return;
        }
        setContributionStatus("error");
        setContributionError(caughtMessage(caught));
      });
    return () => {
      controller.abort();
      if (contributionRequestRef.current === requestId) {
        contributionRequestRef.current += 1;
      }
    };
  }, [fetchContributions, ipr.iprId, selectedStateId, contributionRetryVersion]);

  const selectedState = useMemo(
    () => ipr.states.find((state) => state.stateId === selectedStateId) ?? null,
    [ipr.states, selectedStateId],
  );
  const selectedIndex = selectedState
    ? ipr.states.findIndex((state) => state.stateId === selectedState.stateId)
    : -1;
  const selectedContributionData =
    contributionData?.state.stateId === selectedStateId ? contributionData : null;
  const positiveContributionCount = useMemo(
    () =>
      selectedContributionData?.contributions.filter(
        (entry) => entry.composition > 0,
      ).length ?? 0,
    [selectedContributionData],
  );
  const effectiveTopK = Math.min(topK, positiveContributionCount);
  const criterion: IprClusterCriterion =
    criterionMode === "composition"
      ? { mode: "composition", threshold: thresholdPercent / 100 }
      : { mode: "top-k", topK: effectiveTopK };
  const cluster = useMemo(
    () => selectIprCluster(selectedContributionData?.contributions ?? [], criterion),
    [selectedContributionData, criterionMode, thresholdPercent, topK],
  );
  const currentSignature = selectedStateId
    ? iprCriterionSignature(selectedStateId, criterion)
    : null;
  const structureSelectionIsTracked =
    structureSelectedOnly !== undefined &&
    structureSelectedSiteIndices !== undefined &&
    structureVisibleSiteIndices !== undefined;
  const structureMatchesAppliedCluster =
    !structureSelectionIsTracked ||
    (structureSelectedOnly &&
      siteIndexSetSignature(structureSelectedSiteIndices) ===
        appliedSiteIndicesSignature &&
      siteIndexSetSignature(structureVisibleSiteIndices) ===
        appliedSiteIndicesSignature);
  const contributionWindow = virtualIprContributionWindow(cluster.rows.length, scrollTop);
  const visibleContributionRows = cluster.rows.slice(
    contributionWindow.start,
    contributionWindow.end,
  );

  const selectRelativeState = useCallback(
    (direction: -1 | 1) => {
      if (ipr.states.length === 0) {
        return;
      }
      if (selectedIndex < 0) {
        setSelectedStateId(direction > 0 ? ipr.states[0]!.stateId : ipr.states.at(-1)!.stateId);
        return;
      }
      const nextIndex = Math.min(ipr.states.length - 1, Math.max(0, selectedIndex + direction));
      setSelectedStateId(ipr.states[nextIndex]!.stateId);
    },
    [ipr.states, selectedIndex],
  );

  const chartCsvColumns = (): CsvColumn[] => [
    { header: "dos_energy (eV)", values: ipr.dos.energy },
    { header: "dos", values: ipr.dos.total },
    { header: "state_id", values: ipr.states.map((state) => state.stateId) },
    { header: "band", values: ipr.states.map((state) => state.bandIndex + 1) },
    { header: "state_energy_mean (eV)", values: ipr.states.map((state) => state.energy) },
    { header: "state_energy_min (eV)", values: ipr.states.map((state) => state.energyMin) },
    { header: "state_energy_max (eV)", values: ipr.states.map((state) => state.energyMax) },
    { header: "occupation", values: ipr.states.map((state) => state.occupation) },
    { header: "ipr", values: ipr.states.map((state) => state.ipr) },
    { header: "k_point_count", values: ipr.states.map((state) => state.kPointCount) },
  ];

  const exportContributions = () => {
    if (!selectedContributionData || !selectedState) {
      return;
    }
    downloadCsv(`ipr-band-${selectedState.bandIndex + 1}-atom-contributions.csv`, [
      { header: "rank", values: cluster.rows.map((row) => row.rank) },
      { header: "atom", values: cluster.rows.map((row) => row.siteIndex + 1) },
      { header: "element", values: cluster.rows.map((row) => row.element) },
      { header: "composition", values: cluster.rows.map((row) => row.composition) },
      { header: "cumulative_composition", values: cluster.rows.map((row) => row.cumulativeComposition) },
      { header: "ipr_contribution", values: cluster.rows.map((row) => row.iprContribution) },
      { header: "included", values: cluster.rows.map((row) => (row.included ? "yes" : "no")) },
    ]).catch((error) => console.error("IPR contribution export failed.", error));
  };

  const applyDisabled =
    contributionStatus !== "ready" ||
    !selectedState ||
    !selectedContributionData ||
    cluster.siteIndices.length === 0;
  const capturedIprFraction = selectedState && selectedState.ipr > 0
    ? cluster.includedIprContribution / selectedState.ipr
    : 0;

  return (
    <section ref={cardRef} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-foreground">DOS &amp; IPR</h3>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-1">
            DOS w
            <input type="range" min={0.5} max={4} step={0.5} value={dosWidth} className="h-1 w-12 accent-foreground" onChange={(event) => setDosWidth(Number(event.currentTarget.value))} />
          </label>
          <label className="flex items-center gap-1">
            IPR w
            <input type="range" min={0.3} max={2} step={0.1} value={barWidth} className="h-1 w-12 accent-foreground" onChange={(event) => setBarWidth(Number(event.currentTarget.value))} />
          </label>
          <ChartExportButtons targetRef={cardRef} fileStem="dos-ipr" csvColumns={chartCsvColumns} />
        </div>
      </div>

      <DosIprChart
        dosEnergy={ipr.dos.energy}
        dosTotal={ipr.dos.total}
        states={ipr.states}
        dosColor={dosColor}
        iprColor={iprColor}
        dosWidth={dosWidth}
        barWidth={barWidth}
        xDomain={domainFrom(xMin, xMax)}
        dosDomain={domainFrom(dosMin, dosMax)}
        iprDomain={domainFrom(iprMin, iprMax)}
        selectedStateId={selectedStateId}
        onStateSelect={setSelectedStateId}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          x
          <input aria-label="DOS/IPR x min" placeholder="auto" value={xMin} className={NUMBER_INPUT_CLASS} onChange={(event) => setXMin(event.target.value)} />
          <input aria-label="DOS/IPR x max" placeholder="auto" value={xMax} className={NUMBER_INPUT_CLASS} onChange={(event) => setXMax(event.target.value)} />
        </span>
        <span className="flex items-center gap-1">
          DOS
          <input aria-label="DOS y min" placeholder="auto" value={dosMin} className={NUMBER_INPUT_CLASS} onChange={(event) => setDosMin(event.target.value)} />
          <input aria-label="DOS y max" placeholder="auto" value={dosMax} className={NUMBER_INPUT_CLASS} onChange={(event) => setDosMax(event.target.value)} />
        </span>
        <span className="flex items-center gap-1">
          IPR
          <input aria-label="IPR y min" placeholder="auto" value={iprMin} className={NUMBER_INPUT_CLASS} onChange={(event) => setIprMin(event.target.value)} />
          <input aria-label="IPR y max" placeholder="auto" value={iprMax} className={NUMBER_INPUT_CLASS} onChange={(event) => setIprMax(event.target.value)} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground">
        <label className="flex items-center gap-1">
          <input type="color" aria-label="DOS color" value={dosColor} className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0" onChange={(event) => setDosColor(event.target.value)} />
          DOS
        </label>
        <label className="flex items-center gap-1">
          <input type="color" aria-label="IPR color" value={iprColor} className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0" onChange={(event) => setIprColor(event.target.value)} />
          IPR
        </label>
        <span className="text-muted-foreground">
          E_f = {ipr.efermi.toFixed(3)} eV · {ipr.states.length} bands
        </span>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-[11px] text-foreground">
            {selectedState ? (
              <>
                <span className="font-semibold">Band #{selectedState.bandIndex + 1}</span>
                <span className="text-muted-foreground"> · {selectedState.energy.toFixed(3)} eV · IPR {selectedState.ipr.toPrecision(4)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Click an IPR bar or use Next to select a band.</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="icon" variant="outline" className="size-6" aria-label="Previous IPR band" disabled={ipr.states.length === 0 || selectedIndex === 0} onClick={() => selectRelativeState(-1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button type="button" size="icon" variant="outline" className="size-6" aria-label="Next IPR band" disabled={ipr.states.length === 0 || selectedIndex === ipr.states.length - 1} onClick={() => selectRelativeState(1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        {selectedState ? (
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <div><dt className="inline">Energy range </dt><dd className="inline font-mono">{selectedState.energyMin.toFixed(3)}…{selectedState.energyMax.toFixed(3)} eV</dd></div>
            <div><dt className="inline">Occupation </dt><dd className="inline font-mono">{selectedState.occupation.toFixed(4)}</dd></div>
            <div><dt className="inline">Aggregation </dt><dd className="inline">k-weighted band</dd></div>
            <div><dt className="inline">k points </dt><dd className="inline font-mono">{selectedState.kPointCount}</dd></div>
          </dl>
        ) : null}
      </div>

      {selectedState ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="IPR cluster criterion" className="flex rounded-md border border-border p-0.5 text-[10px]">
              <button type="button" aria-pressed={criterionMode === "composition"} className={`rounded px-2 py-1 ${criterionMode === "composition" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setCriterionMode("composition")}>Composition</button>
              <button type="button" aria-pressed={criterionMode === "top-k"} className={`rounded px-2 py-1 ${criterionMode === "top-k" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setCriterionMode("top-k")}>Top K</button>
            </div>
            <button type="button" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={!selectedContributionData} onClick={exportContributions}>
              <Download className="size-3" aria-hidden="true" />
              Atom CSV
            </button>
          </div>

          {criterionMode === "composition" ? (
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              Cumulative composition
              <input aria-label="Composition threshold" type="range" min={1} max={100} step={1} value={thresholdPercent} className="h-1 min-w-20 flex-1 accent-foreground" onChange={(event) => setThresholdPercent(Number(event.currentTarget.value))} />
              <input aria-label="Composition threshold percent" type="number" min={1} max={100} step={1} value={thresholdPercent} className={NUMBER_INPUT_CLASS} onChange={(event) => setThresholdPercent(Math.min(100, Math.max(1, Number(event.currentTarget.value) || 1)))} />%
            </label>
          ) : (
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              Number of atoms
              <input aria-label="Top K atoms" type="number" min={1} max={Math.max(1, positiveContributionCount)} step={1} value={Math.max(1, effectiveTopK)} className={NUMBER_INPUT_CLASS} onChange={(event) => setTopK(Math.min(Math.max(1, positiveContributionCount), Math.max(1, Math.floor(Number(event.currentTarget.value) || 1))))} />
              <span>of {positiveContributionCount}</span>
            </label>
          )}

          {contributionStatus === "loading" || (contributionStatus === "ready" && !selectedContributionData) ? <p className="py-4 text-center text-[11px] text-muted-foreground">Loading atom contributions…</p> : null}
          {contributionStatus === "error" ? (
            <div className="flex items-center justify-between gap-2 py-2">
              <p role="alert" className="text-[11px] text-red-600">{contributionError}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setContributionRetryVersion((version) => version + 1)}>
                Retry
              </Button>
            </div>
          ) : null}
          {contributionStatus === "ready" && selectedContributionData ? (
            <>
              <div className="grid grid-cols-[3rem_2rem_1fr_1fr_1fr_2.5rem] border-b border-border px-1 pb-1 text-[9px] font-medium text-muted-foreground">
                <span>Atom</span><span>El.</span><span className="text-right">Comp.</span><span className="text-right">Cum.</span><span className="text-right">IPR</span><span className="text-center">Use</span>
              </div>
              <div
                role="list"
                aria-label="IPR atom contributions"
                className="overflow-y-auto"
                style={{ height: IPR_CONTRIBUTION_LIST_HEIGHT_PX }}
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              >
                <div className="relative" style={{ height: contributionWindow.totalHeight }}>
                  <div className="absolute inset-x-0" style={{ top: contributionWindow.offsetTop }}>
                    {visibleContributionRows.map((row) => (
                      <div
                        key={row.siteIndex}
                        role="listitem"
                        data-site-index={row.siteIndex}
                        data-included={row.included}
                        className={`grid grid-cols-[3rem_2rem_1fr_1fr_1fr_2.5rem] items-center rounded px-1 font-mono text-[9px] ${row.included ? "bg-sky-50 text-sky-950" : "text-muted-foreground"}`}
                        style={{ height: IPR_CONTRIBUTION_ROW_HEIGHT_PX }}
                      >
                        <span>#{row.siteIndex + 1}</span>
                        <span className="font-sans">{row.element}</span>
                        <span className="text-right">{formatPercent(row.composition)}</span>
                        <span className="text-right">{formatPercent(row.cumulativeComposition)}</span>
                        <span className="text-right">{row.iprContribution.toExponential(2)}</span>
                        <span className="flex justify-center">{row.included ? <Check aria-label="Included" className="size-3 text-sky-600" /> : null}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {cluster.siteIndices.length} atoms · {formatPercent(cluster.includedComposition)} composition · {formatPercent(capturedIprFraction)} of IPR captured
              </p>
            </>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <Button
              type="button"
              size="sm"
              disabled={applyDisabled}
              onClick={() => {
                onApplyToStructure(cluster.siteIndices);
                if (currentSignature) {
                  setAppliedSignature(currentSignature);
                  setAppliedSiteIndicesSignature(
                    siteIndexSetSignature(cluster.siteIndices),
                  );
                }
              }}
            >
              Apply to structure
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={appliedSignature === null} onClick={() => { onClearFromStructure(); setAppliedSignature(null); setAppliedSiteIndicesSignature(null); }}>
              Clear from structure
            </Button>
            {onColorStructure ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedContributionData}
                onClick={() => {
                  if (!selectedContributionData) {
                    return;
                  }
                  onColorStructure(new Map(
                    selectedContributionData.contributions.map((entry) => [
                      entry.siteIndex,
                      entry.composition,
                    ]),
                  ));
                }}
              >
                Color atoms
              </Button>
            ) : null}
            {onColorStructure ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onColorStructure(null)}
              >
                Clear color
              </Button>
            ) : null}
            <span aria-live="polite" className="text-[10px] text-muted-foreground">
              {appliedSignature === null
                ? contributionStatus === "ready" && cluster.siteIndices.length > 0 ? "Ready to apply" : "Not applied"
                : appliedSignature !== currentSignature
                  ? "Changes not applied"
                  : structureMatchesAppliedCluster
                    ? "Applied to structure"
                    : "Structure selection changed"}
            </span>
          </div>
        </div>
      ) : null}

      {ipr.warnings?.length ? (
        <ul className="list-disc pl-4 text-[10px] text-amber-700">
          {ipr.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function siteIndexSetSignature(siteIndices: Iterable<number>): string {
  return [...siteIndices].sort((left, right) => left - right).join(",");
}
