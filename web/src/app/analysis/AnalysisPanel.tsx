import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ANALYSIS_PANEL_MIN_WIDTH_PX } from "../../model/layout";
import type { BondCutoffSpec } from "../../api/scene";
import {
  computeDescriptors,
  computeDynamics,
  computeGr,
  type AxisSeries,
  type DescriptorsResult,
  type DynamicsResult,
  type GrResponse,
} from "../../api/analysis";
import { HeatmapCard, LineChartCard, type RawSeries } from "./chartCards";

type Status = "idle" | "loading" | "ready" | "error";

const NUMBER_INPUT_CLASS =
  "h-7 w-16 rounded border border-border bg-background px-1 text-center font-mono text-xs";

function axisSeries(x: number[], data: AxisSeries): RawSeries[] {
  return [
    { label: "total", x, y: data.total },
    ...data.perElement.map((entry) => ({ label: entry.element, x, y: entry.values })),
  ];
}

export function AnalysisPanel({
  frameCount,
  isOpen,
  onClose,
  symbols,
  trajectoryId,
  width,
  onWidthChange,
  onResizeActiveChange,
}: {
  frameCount: number;
  isOpen: boolean;
  onClose: () => void;
  symbols: string[];
  trajectoryId: string | null;
  width: number;
  onWidthChange: (width: number) => void;
  onResizeActiveChange?: (active: boolean) => void;
}) {
  const [frameStart, setFrameStart] = useState("0");
  const [frameEnd, setFrameEnd] = useState(String(frameCount));
  const [stride, setStride] = useState(String(Math.max(1, Math.ceil(frameCount / 200))));

  const [grStatus, setGrStatus] = useState<Status>("idle");
  const [gr, setGr] = useState<GrResponse | null>(null);
  const [cutoffs, setCutoffs] = useState<BondCutoffSpec[]>([]);

  const [descStatus, setDescStatus] = useState<Status>("idle");
  const [descriptors, setDescriptors] = useState<DescriptorsResult | null>(null);

  const [rMin, setRMin] = useState("2.0");
  const [rMax, setRMax] = useState("4.0");
  const [nPoint, setNPoint] = useState("100");
  const [timestep, setTimestep] = useState("1.0");
  const [dynStatus, setDynStatus] = useState<Status>("idle");
  const [dynamics, setDynamics] = useState<DynamicsResult | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset when a different trajectory is loaded.
    setGr(null);
    setDescriptors(null);
    setDynamics(null);
    setCutoffs([]);
    setGrStatus("idle");
    setDescStatus("idle");
    setDynStatus("idle");
    setError(null);
    setFrameEnd(String(frameCount));
    setStride(String(Math.max(1, Math.ceil(frameCount / 200))));
  }, [trajectoryId, frameCount]);

  const range = useCallback(
    () => ({
      frameStart: Number(frameStart) || 0,
      frameEnd: Number(frameEnd) || frameCount,
      stride: Math.max(1, Number(stride) || 1),
    }),
    [frameStart, frameEnd, stride, frameCount],
  );

  // The panel is pinned to the left edge, so its width tracks the pointer's x.
  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      onResizeActiveChange?.(true);
      const onMove = (moveEvent: PointerEvent) => {
        const clamped = Math.max(
          ANALYSIS_PANEL_MIN_WIDTH_PX,
          Math.min(moveEvent.clientX, window.innerWidth - 220),
        );
        onWidthChange(clamped);
      };
      const onUp = () => {
        onResizeActiveChange?.(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onResizeActiveChange, onWidthChange],
  );

  const runGr = useCallback(async () => {
    if (!trajectoryId) {
      return;
    }
    setGrStatus("loading");
    setError(null);
    try {
      const result = await computeGr(trajectoryId, range());
      setGr(result);
      setCutoffs(result.suggestedCutoffs);
      setGrStatus("ready");
    } catch (caught) {
      setGrStatus("error");
      setError(caught instanceof Error ? caught.message : "g(r) computation failed.");
    }
  }, [trajectoryId, range]);

  const runDescriptors = useCallback(async () => {
    if (!trajectoryId) {
      return;
    }
    setDescStatus("loading");
    setError(null);
    try {
      const result = await computeDescriptors(trajectoryId, range(), cutoffs);
      setDescriptors(result.descriptors);
      setDescStatus("ready");
    } catch (caught) {
      setDescStatus("error");
      setError(caught instanceof Error ? caught.message : "Descriptor computation failed.");
    }
  }, [trajectoryId, range, cutoffs]);

  const runDynamics = useCallback(async () => {
    if (!trajectoryId) {
      return;
    }
    setDynStatus("loading");
    setError(null);
    try {
      const result = await computeDynamics(trajectoryId, range(), {
        rMin: Number(rMin) || 2.0,
        rMax: Number(rMax) || 4.0,
        nPoint: Number(nPoint) || 100,
        timestep: Number(timestep) || 1.0,
      });
      setDynamics(result.dynamics);
      setDynStatus("ready");
    } catch (caught) {
      setDynStatus("error");
      setError(caught instanceof Error ? caught.message : "MSD/ALTBC computation failed.");
    }
  }, [trajectoryId, range, rMin, rMax, nPoint, timestep]);

  return (
    <aside
      aria-label="Structure analysis"
      aria-hidden={!isOpen}
      inert={!isOpen}
      style={{ width }}
      className={cn(
        "absolute inset-y-0 left-0 z-30 flex max-w-[calc(100vw-1rem)] flex-col border-r border-border bg-[#fdfdfd] text-foreground",
        "transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div
        aria-hidden="true"
        onPointerDown={handleResizeStart}
        className="absolute inset-y-0 right-0 z-40 w-1.5 cursor-col-resize hover:bg-foreground/10"
        title="Drag to resize"
      />
      <header className="flex h-14 shrink-0 items-center justify-between px-4">
        <h2 className="text-sm font-semibold">Structure analysis</h2>
        <Button variant="ghost" size="icon" aria-label="Close analysis" className="size-8" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold text-muted-foreground">Frames</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1">
                from
                <input aria-label="Frame start" value={frameStart} className={NUMBER_INPUT_CLASS} onChange={(e) => setFrameStart(e.target.value)} />
              </label>
              <label className="flex items-center gap-1">
                to
                <input aria-label="Frame end" value={frameEnd} className={NUMBER_INPUT_CLASS} onChange={(e) => setFrameEnd(e.target.value)} />
              </label>
              <label className="flex items-center gap-1">
                stride
                <input aria-label="Frame stride" value={stride} className={NUMBER_INPUT_CLASS} onChange={(e) => setStride(e.target.value)} />
              </label>
              <span>/ {frameCount} frames</span>
            </div>
            <Button size="sm" className="w-fit" disabled={grStatus === "loading"} onClick={() => void runGr()}>
              {grStatus === "loading" ? "Computing g(r)…" : "Compute g(r)"}
            </Button>
          </section>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          {gr ? (
            <LineChartCard
              title="Pair distribution g(r)"
              xLabel="r (Å)"
              yLabel="g(r)"
              series={[
                { label: "total", x: gr.gr.r, y: gr.gr.total },
                ...gr.gr.pairs.map((pair) => ({ label: pair.label, x: gr.gr.r, y: pair.values })),
              ]}
            />
          ) : null}

          {gr ? (
            <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
              <h3 className="text-[13px] font-semibold">Bond cutoffs (Å)</h3>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Seeded from the first minimum of each pair g(r). Adjust, then compute descriptors.
              </p>
              <div className="flex flex-col gap-1">
                {cutoffs.map((cutoff, index) => (
                  <label key={cutoff.elements.join("-")} className="flex items-center justify-between text-xs">
                    <span className="font-mono">
                      {cutoff.elements[0]}–{cutoff.elements[1]}
                    </span>
                    <input
                      aria-label={`${cutoff.elements[0]}-${cutoff.elements[1]} cutoff`}
                      value={cutoff.distance}
                      className={NUMBER_INPUT_CLASS}
                      onChange={(event) =>
                        setCutoffs((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? { ...entry, distance: Number(event.target.value) || 0 }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <Button size="sm" className="w-fit" disabled={descStatus === "loading"} onClick={() => void runDescriptors()}>
                {descStatus === "loading" ? "Computing…" : "Compute CN / ADF / q"}
              </Button>
            </section>
          ) : null}

          {descriptors ? (
            <>
              <LineChartCard variant="bar" title="Coordination number" xLabel="CN" yLabel="fraction (%)" series={axisSeries(descriptors.cn.cn, descriptors.cn)} />
              <LineChartCard title="Angular distribution (ADF)" xLabel="angle (°)" yLabel="count" series={axisSeries(descriptors.adf.angle, descriptors.adf)} />
              <LineChartCard title="Order parameter" xLabel="d" yLabel="count" series={axisSeries(descriptors.orderParameter.value, descriptors.orderParameter)} />
              <LineChartCard title="q (3-fold)" xLabel="q3" yLabel="count" series={axisSeries(descriptors.q.q3.value, descriptors.q.q3)} />
              <LineChartCard title="q (4-fold)" xLabel="q4" yLabel="count" series={axisSeries(descriptors.q.q4.value, descriptors.q.q4)} />
              <LineChartCard title="q (5-fold)" xLabel="q5" yLabel="count" series={axisSeries(descriptors.q.q5.value, descriptors.q.q5)} />
            </>
          ) : null}

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold text-muted-foreground">Dynamics (fastatomstruct)</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1">
                r range
                <input aria-label="ALTBC r min" value={rMin} className={NUMBER_INPUT_CLASS} onChange={(e) => setRMin(e.target.value)} />
                <input aria-label="ALTBC r max" value={rMax} className={NUMBER_INPUT_CLASS} onChange={(e) => setRMax(e.target.value)} />
              </label>
              <label className="flex items-center gap-1">
                points
                <input aria-label="ALTBC points" value={nPoint} className={NUMBER_INPUT_CLASS} onChange={(e) => setNPoint(e.target.value)} />
              </label>
              <label className="flex items-center gap-1">
                dt
                <input aria-label="MSD timestep" value={timestep} className={NUMBER_INPUT_CLASS} onChange={(e) => setTimestep(e.target.value)} />
              </label>
            </div>
            <Button size="sm" className="w-fit" disabled={dynStatus === "loading"} onClick={() => void runDynamics()}>
              {dynStatus === "loading" ? "Computing…" : "Compute MSD / ALTBC"}
            </Button>
          </section>

          {dynamics ? (
            <>
              <LineChartCard
                title="Mean squared displacement"
                xLabel="time"
                yLabel="MSD (Å²)"
                series={[
                  { label: "total", x: dynamics.msd.time, y: dynamics.msd.total },
                  ...dynamics.msd.perElement.map((entry) => ({
                    label: entry.element,
                    x: dynamics.msd.time,
                    y: entry.values,
                  })),
                ]}
              />
              <HeatmapCard title="ALTBC" xLabel="r₁ (Å)" yLabel="r₂ (Å)" matrix={dynamics.altbc.matrix} axis={dynamics.altbc.axis} />
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
