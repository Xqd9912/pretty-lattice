import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ELECTRONIC_PANEL_MIN_WIDTH_PX } from "../../model/layout";
import type { SceneSpec } from "../../api/scene";
import type { IsosurfaceOverlay } from "../../scene/DensityIsosurface";

import {
  fetchChgcarLed,
  fetchChgcarSlice,
  fetchIsosurface,
  uploadChgcar,
  uploadDos,
  uploadIpr,
  type ChgcarResponse,
  type DensitySlice,
  type DosResponse,
  type IprResponse,
  type IsosurfaceMesh,
  type SliceAxis,
} from "../../api/electronic";
import { LineChartCard } from "../analysis/chartCards";
import { DensityHeatmap, type DensityColormap } from "./DensityHeatmap";
import { DosIprCard } from "./DosIprCard";

type Status = "idle" | "loading" | "ready" | "error";

const NUMBER_INPUT_CLASS =
  "h-7 w-16 rounded border border-border bg-background px-1 text-center font-mono text-xs";
const SLICE_AXES: SliceAxis[] = ["a", "b", "c"];

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function UploadButton({
  accept,
  disabled,
  label,
  onFile,
}: {
  accept?: string;
  disabled?: boolean;
  label: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            onFile(file);
          }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud aria-hidden="true" />
        {label}
      </Button>
    </>
  );
}

export function ElectronicPanel({
  isOpen,
  width,
  onWidthChange,
  rightOffset,
  onResizeActiveChange,
  onDensitySceneChange,
  onIsosurfaceChange,
}: {
  isOpen: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  rightOffset: number;
  onResizeActiveChange: (active: boolean) => void;
  onDensitySceneChange: (next: { scene: SceneSpec; fileName: string } | null) => void;
  onIsosurfaceChange: (overlay: IsosurfaceOverlay | null) => void;
}) {
  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      onResizeActiveChange(true);
      const panelRightEdge = window.innerWidth - rightOffset;
      const onMove = (moveEvent: PointerEvent) => {
        const next = panelRightEdge - moveEvent.clientX;
        const clamped = Math.max(
          ELECTRONIC_PANEL_MIN_WIDTH_PX,
          Math.min(next, window.innerWidth - 220),
        );
        onWidthChange(clamped);
      };
      const onUp = () => {
        onResizeActiveChange(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onResizeActiveChange, onWidthChange, rightOffset],
  );

  // Charge density (CHGCAR).
  const [chgcarStatus, setChgcarStatus] = useState<Status>("idle");
  const [chgcar, setChgcar] = useState<ChgcarResponse | null>(null);
  const [slice, setSlice] = useState<DensitySlice | null>(null);
  const [sliceAxis, setSliceAxis] = useState<SliceAxis>("c");
  const [sliceIndex, setSliceIndex] = useState(0);
  const [colormap, setColormap] = useState<DensityColormap>("viridis");
  const [vmin, setVmin] = useState("0");
  const [vmax, setVmax] = useState("2");
  const [threshold, setThreshold] = useState("0.22");
  const [ledFraction, setLedFraction] = useState<number | null>(null);
  const [ledCurve, setLedCurve] = useState<{ density: number[]; percent: number[] } | null>(null);

  // Electron-cloud isosurface (3D).
  const [isoLevel, setIsoLevel] = useState(1.0);
  const [isoColor, setIsoColor] = useState("#f2c14e");
  const [isoOpacity, setIsoOpacity] = useState(0.6);
  const [isoVisible, setIsoVisible] = useState(true);
  const [isoMesh, setIsoMesh] = useState<IsosurfaceMesh | null>(null);
  const [isoStatus, setIsoStatus] = useState<Status>("idle");

  // DOS + IPR.
  const [dosStatus, setDosStatus] = useState<Status>("idle");
  const [dos, setDos] = useState<DosResponse | null>(null);
  const [iprStatus, setIprStatus] = useState<Status>("idle");
  const [ipr, setIpr] = useState<IprResponse | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadChgcar = useCallback(
    async (file: File) => {
      setChgcarStatus("loading");
      setError(null);
      try {
        const result = await uploadChgcar(file, 0.22);
        setChgcar(result);
        setSlice(result.slice);
        setSliceAxis(result.slice.axis);
        setSliceIndex(result.slice.index);
        setLedFraction(result.distribution.ledFraction);
        setLedCurve({
          density: result.distribution.density,
          percent: result.distribution.percent,
        });
        setThreshold(String(result.distribution.threshold));
        setChgcarStatus("ready");
        // Show the structure + electron cloud in the main viewport, and seed the
        // isolevel at 40% of the peak density for a legible starting surface.
        onDensitySceneChange({ scene: result.scene, fileName: file.name });
        setIsoMesh(null);
        setIsoVisible(true);
        setIsoLevel(Number((Math.max(0.2, result.densityRange.max * 0.4)).toFixed(2)));
      } catch (caught) {
        setChgcarStatus("error");
        setError(errorMessage(caught, "CHGCAR load failed."));
      }
    },
    [onDensitySceneChange],
  );

  const unloadChgcar = useCallback(() => {
    setChgcar(null);
    setSlice(null);
    setLedCurve(null);
    setLedFraction(null);
    setIsoMesh(null);
    setChgcarStatus("idle");
    setIsoStatus("idle");
    onDensitySceneChange(null);
  }, [onDensitySceneChange]);

  // Fetch the isosurface mesh when the level changes (debounced).
  useEffect(() => {
    if (!chgcar) {
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setIsoStatus("loading");
      fetchIsosurface(chgcar.chgcarId, isoLevel)
        .then((mesh) => {
          if (!cancelled) {
            setIsoMesh(mesh);
            setIsoStatus("ready");
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setIsoStatus("error");
            setError(errorMessage(caught, "Isosurface computation failed."));
          }
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [chgcar, isoLevel]);

  // Push the current overlay (mesh + material) to the viewport.
  useEffect(() => {
    if (isoMesh && isoVisible && isoMesh.vertexCount > 0) {
      onIsosurfaceChange({
        vertices: isoMesh.vertices,
        faces: isoMesh.faces,
        color: isoColor,
        opacity: isoOpacity,
      });
    } else {
      onIsosurfaceChange(null);
    }
  }, [isoMesh, isoVisible, isoColor, isoOpacity, onIsosurfaceChange]);

  const loadSlice = useCallback(
    async (axis: SliceAxis, index: number) => {
      if (!chgcar) {
        return;
      }
      setSliceAxis(axis);
      setSliceIndex(index);
      try {
        const result = await fetchChgcarSlice(chgcar.chgcarId, axis, index);
        setSlice(result);
      } catch (caught) {
        setError(errorMessage(caught, "Slice request failed."));
      }
    },
    [chgcar],
  );

  const recomputeLed = useCallback(
    async (nextThreshold: number) => {
      if (!chgcar) {
        return;
      }
      try {
        const result = await fetchChgcarLed(chgcar.chgcarId, nextThreshold);
        setLedFraction(result.ledFraction);
        setLedCurve({ density: result.density, percent: result.percent });
      } catch (caught) {
        setError(errorMessage(caught, "LED recomputation failed."));
      }
    },
    [chgcar],
  );

  const loadDos = useCallback(async (file: File) => {
    setDosStatus("loading");
    setError(null);
    try {
      setDos(await uploadDos(file));
      setDosStatus("ready");
    } catch (caught) {
      setDosStatus("error");
      setError(errorMessage(caught, "DOS load failed."));
    }
  }, []);

  const loadIpr = useCallback(async (file: File) => {
    setIprStatus("loading");
    setError(null);
    try {
      setIpr(await uploadIpr(file));
      setIprStatus("ready");
    } catch (caught) {
      setIprStatus("error");
      setError(errorMessage(caught, "IPR load failed."));
    }
  }, []);

  const sliceCount = slice?.count ?? 1;
  const vminValue = Number(vmin) || 0;
  const vmaxValue = Number(vmax) || 1;

  return (
    <aside
      aria-label="Electronic properties"
      aria-hidden={!isOpen}
      inert={!isOpen}
      style={{
        width,
        right: rightOffset,
        // When closed, translate fully off-screen accounting for the right
        // offset — otherwise a nonzero offset leaves the panel partly visible,
        // covering the inspector column.
        transform: isOpen ? "translateX(0)" : `translateX(calc(100% + ${rightOffset}px))`,
      }}
      className={cn(
        "absolute inset-y-0 z-30 flex max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-[#fdfdfd] text-foreground",
        "transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
      )}
    >
      <div
        aria-hidden="true"
        onPointerDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-40 w-1.5 cursor-col-resize hover:bg-foreground/10"
        title="Drag to resize"
      />
      <header className="flex h-14 shrink-0 items-center px-4 pr-16">
        <h2 className="text-sm font-semibold">Electronic properties</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="flex flex-col gap-5">
          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          {/* 1 & 2 — Charge density: slice visualization + LED distribution. */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold text-muted-foreground">Charge density (CHGCAR)</h3>
            <UploadButton
              label={chgcarStatus === "loading" ? "Loading CHGCAR…" : "Load CHGCAR"}
              disabled={chgcarStatus === "loading"}
              onFile={(file) => void loadChgcar(file)}
            />
            {chgcar ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {chgcar.symbols.join(" ")} · {chgcar.atomCount} atoms · grid{" "}
                  {chgcar.grid.nx}×{chgcar.grid.ny}×{chgcar.grid.nz} ·{" "}
                  {chgcar.totalElectrons.toFixed(1)} e⁻
                </p>
                <button
                  className="shrink-0 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-foreground/5"
                  onClick={unloadChgcar}
                >
                  Unload
                </button>
              </div>
            ) : null}
          </section>

          {chgcar ? (
            <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold">Electron cloud (isosurface)</h3>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isoVisible}
                    className="size-3 accent-foreground"
                    onChange={(event) => setIsoVisible(event.target.checked)}
                  />
                  show
                </label>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                level {isoLevel.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, chgcar.densityRange.max).toFixed(2)}
                  step={0.02}
                  value={isoLevel}
                  className="h-1 flex-1 accent-foreground"
                  onChange={(event) => setIsoLevel(Number(event.currentTarget.value))}
                />
              </label>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <label className="flex items-center gap-1">
                  <input
                    type="color"
                    aria-label="cloud color"
                    value={isoColor}
                    className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0"
                    onChange={(event) => setIsoColor(event.target.value)}
                  />
                  color
                </label>
                <label className="flex items-center gap-1">
                  opacity
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={isoOpacity}
                    className="h-1 w-16 accent-foreground"
                    onChange={(event) => setIsoOpacity(Number(event.currentTarget.value))}
                  />
                </label>
                <span>
                  {isoStatus === "loading"
                    ? "computing…"
                    : isoMesh
                      ? `${isoMesh.triangleCount.toLocaleString()} tris`
                      : ""}
                </span>
              </div>
            </section>
          ) : null}

          {slice ? (
            <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold">Density slice (ρ / ρ̄)</h3>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {SLICE_AXES.map((axis) => (
                    <button
                      key={axis}
                      className={cn(
                        "h-6 w-6 rounded border border-border font-mono",
                        sliceAxis === axis ? "bg-foreground text-background" : "bg-background",
                      )}
                      onClick={() => void loadSlice(axis, Math.floor((sliceCount - 1) / 2))}
                    >
                      {axis}
                    </button>
                  ))}
                </div>
              </div>
              <DensityHeatmap
                matrix={slice.matrix}
                colormap={colormap}
                vmin={vminValue}
                vmax={vmaxValue}
                rowLabel={slice.rowAxis}
                colLabel={slice.colAxis}
              />
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {sliceAxis} = {sliceIndex}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, sliceCount - 1)}
                  value={sliceIndex}
                  className="h-1 flex-1 accent-foreground"
                  onChange={(event) => void loadSlice(sliceAxis, Number(event.currentTarget.value))}
                />
                / {sliceCount}
              </label>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <label className="flex items-center gap-1">
                  colormap
                  <select
                    value={colormap}
                    className="h-6 rounded border border-border bg-background px-1 text-[11px]"
                    onChange={(event) => setColormap(event.currentTarget.value as DensityColormap)}
                  >
                    <option value="viridis">viridis</option>
                    <option value="magma">magma</option>
                    <option value="gray">gray</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  min
                  <input aria-label="density vmin" value={vmin} className={NUMBER_INPUT_CLASS} onChange={(e) => setVmin(e.target.value)} />
                </label>
                <label className="flex items-center gap-1">
                  max
                  <input aria-label="density vmax" value={vmax} className={NUMBER_INPUT_CLASS} onChange={(e) => setVmax(e.target.value)} />
                </label>
              </div>
            </section>
          ) : null}

          {ledCurve ? (
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-md bg-foreground px-2 py-1 font-mono text-background">
                  LED fraction = {(ledFraction ?? 0).toFixed(4)}
                </span>
                <label className="flex items-center gap-1 text-muted-foreground">
                  threshold
                  <input
                    aria-label="LED threshold"
                    value={threshold}
                    className={NUMBER_INPUT_CLASS}
                    onChange={(event) => setThreshold(event.target.value)}
                    onBlur={(event) => void recomputeLed(Number(event.target.value) || 0.22)}
                  />
                </label>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Fraction of grid points below {threshold}× the mean density. 0.22 is the empirical
                phase-change threshold.
              </p>
              <LineChartCard
                title="Low electron density distribution"
                xLabel="ρ / ρ̄"
                yLabel="grid points (%)"
                series={[{ label: "distribution", x: ledCurve.density, y: ledCurve.percent }]}
              />
            </section>
          ) : null}

          {/* 3 — DOS. */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold text-muted-foreground">Density of states (TDOS.dat)</h3>
            <UploadButton
              label={dosStatus === "loading" ? "Loading DOS…" : "Load TDOS.dat"}
              disabled={dosStatus === "loading"}
              onFile={(file) => void loadDos(file)}
            />
          </section>

          {dos ? (
            <LineChartCard
              title="Total density of states"
              xLabel="energy (eV)"
              yLabel="DOS"
              series={dos.channels.map((channel) => ({
                label: channel.label,
                x: dos.energy,
                y: channel.values,
              }))}
            />
          ) : null}

          {/* 4 — IPR + DOS overlay. */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold text-muted-foreground">IPR (vasprun.xml)</h3>
            <UploadButton
              label={iprStatus === "loading" ? "Computing IPR…" : "Load vasprun.xml"}
              disabled={iprStatus === "loading"}
              onFile={(file) => void loadIpr(file)}
            />
          </section>

          {ipr ? (
            <DosIprCard
              dosEnergy={ipr.dos.energy}
              dosTotal={ipr.dos.total}
              iprEnergy={ipr.ipr.energy}
              iprValue={ipr.ipr.value}
              efermi={ipr.efermi}
            />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
