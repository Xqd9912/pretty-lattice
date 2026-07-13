import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SceneSpec } from "../../api/scene";
import type { IsosurfaceOverlay } from "../../scene/DensityIsosurface";
import {
  fetchChgcarLed,
  fetchChgcarSlice,
  fetchIsosurface,
  fetchLineProfile,
  fetchNeighbors,
  uploadChgcar,
  uploadElfcar,
  type ChgcarResponse,
  type DensitySlice,
  type ElfcarResponse,
  type GridAtom,
  type IsosurfaceMesh,
  type LineProfile,
  type NeighborEntry,
  type SliceAxis,
  type ValueHistogram,
} from "../../api/electronic";
import { LineChartCard } from "../analysis/chartCards";
import { ChartExportButtons, slugify, type CsvColumn } from "../analysis/chartExport";
import { DensityHeatmap, type DensityColormap } from "./DensityHeatmap";

type Status = "idle" | "loading" | "ready" | "error";

const NUMBER_INPUT_CLASS =
  "h-7 w-16 rounded border border-border bg-background px-1 text-center font-mono text-xs";
const SLICE_AXES: SliceAxis[] = ["a", "b", "c"];

/** Everything the section needs regardless of whether it is a CHGCAR or ELFCAR
 * grid — the upload responses are normalized down to this. */
interface LoadedGrid {
  gridId: string;
  kind: "chgcar" | "elfcar";
  valueLabel: string;
  symbols: string[];
  atomCount: number;
  atoms: GridAtom[];
  grid: { nx: number; ny: number; nz: number };
  totalElectrons: number;
  densityRange: { min: number; max: number };
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function UploadButton({
  disabled,
  label,
  onFile,
}: {
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

/**
 * Reusable visualization + analysis block for a VASP volumetric grid. Drives the
 * shared CHGCAR pipeline (structure scene, electron-cloud isosurface, orthogonal
 * slice heatmap) plus the bonding-path profile, and swaps the distribution card
 * between the LED curve (CHGCAR) and the value histogram (ELFCAR).
 */
export function VolumetricSection({
  kind,
  title,
  onDensitySceneChange,
  onIsosurfaceChange,
  onError,
}: {
  kind: "chgcar" | "elfcar";
  title: string;
  onDensitySceneChange: (next: { scene: SceneSpec; fileName: string } | null) => void;
  onIsosurfaceChange: (overlay: IsosurfaceOverlay | null) => void;
  onError: (message: string | null) => void;
}) {
  const isChgcar = kind === "chgcar";

  const [status, setStatus] = useState<Status>("idle");
  const [grid, setGrid] = useState<LoadedGrid | null>(null);

  // Slice heatmap.
  const [slice, setSlice] = useState<DensitySlice | null>(null);
  const [sliceAxis, setSliceAxis] = useState<SliceAxis>("c");
  const [sliceIndex, setSliceIndex] = useState(0);
  const [colormap, setColormap] = useState<DensityColormap>("viridis");
  const [vmin, setVmin] = useState(isChgcar ? "0" : "0");
  const [vmax, setVmax] = useState(isChgcar ? "2" : "1");

  // Distribution: LED (CHGCAR) or value histogram (ELFCAR).
  const [threshold, setThreshold] = useState("0.22");
  const [ledFraction, setLedFraction] = useState<number | null>(null);
  const [ledCurve, setLedCurve] = useState<{ density: number[]; percent: number[] } | null>(null);
  const [histogram, setHistogram] = useState<ValueHistogram | null>(null);

  // Isosurface (3D electron cloud).
  const [isoLevel, setIsoLevel] = useState(1.0);
  const [isoColor, setIsoColor] = useState(isChgcar ? "#f2c14e" : "#4ea8f2");
  const [isoOpacity, setIsoOpacity] = useState(0.6);
  const [isoVisible, setIsoVisible] = useState(true);
  const [isoMesh, setIsoMesh] = useState<IsosurfaceMesh | null>(null);
  const [isoStatus, setIsoStatus] = useState<Status>("idle");

  // Bonding-path profile. The second atom is restricted to the neighbors of the
  // first within a cutoff, so the profile is always drawn along a real bond.
  const [atomI, setAtomI] = useState(0);
  const [atomJ, setAtomJ] = useState<number | null>(null);
  const [rCut, setRCut] = useState(3.5);
  const [neighbors, setNeighbors] = useState<NeighborEntry[]>([]);
  const [profileRadius, setProfileRadius] = useState(0.5);
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<Status>("idle");

  const applyLoaded = useCallback(
    (response: ChgcarResponse | ElfcarResponse, fileName: string) => {
      setGrid({
        gridId: response.gridId,
        kind: response.kind,
        valueLabel: response.valueLabel,
        symbols: response.symbols,
        atomCount: response.atomCount,
        atoms: response.atoms,
        grid: response.grid,
        totalElectrons: response.totalElectrons,
        densityRange: response.densityRange,
      });
      setSlice(response.slice);
      setSliceAxis(response.slice.axis);
      setSliceIndex(response.slice.index);
      if (response.kind === "chgcar") {
        const distribution = (response as ChgcarResponse).distribution;
        setLedFraction(distribution.ledFraction);
        setLedCurve({ density: distribution.density, percent: distribution.percent });
        setThreshold(String(distribution.threshold));
        setHistogram(null);
      } else {
        setHistogram((response as ElfcarResponse).distribution);
        setLedCurve(null);
        setLedFraction(null);
      }
      setStatus("ready");
      onDensitySceneChange({ scene: response.scene, fileName });
      setIsoMesh(null);
      setIsoVisible(true);
      // Seed a legible starting isolevel. For ELF (bounded [0,1]) 0.7 marks
      // strongly localized electrons; for density use 40% of the peak.
      setIsoLevel(
        response.kind === "elfcar"
          ? 0.7
          : Number(Math.max(0.2, response.densityRange.max * 0.4).toFixed(2)),
      );
      setAtomI(0);
      setAtomJ(null);
      setNeighbors([]);
      setProfile(null);
      setProfileStatus("idle");
    },
    [onDensitySceneChange],
  );

  const load = useCallback(
    async (file: File) => {
      setStatus("loading");
      onError(null);
      try {
        const response = isChgcar ? await uploadChgcar(file, 0.22) : await uploadElfcar(file);
        applyLoaded(response, file.name);
      } catch (caught) {
        setStatus("error");
        onError(errorMessage(caught, `${title} load failed.`));
      }
    },
    [applyLoaded, isChgcar, onError, title],
  );

  const unload = useCallback(() => {
    setGrid(null);
    setSlice(null);
    setLedCurve(null);
    setLedFraction(null);
    setHistogram(null);
    setIsoMesh(null);
    setProfile(null);
    setNeighbors([]);
    setAtomJ(null);
    setStatus("idle");
    setIsoStatus("idle");
    onDensitySceneChange(null);
    onIsosurfaceChange(null);
  }, [onDensitySceneChange, onIsosurfaceChange]);

  // Refresh the neighbor list whenever the first atom or the cutoff changes.
  // The second-atom picker (and the default selection) follows from it.
  useEffect(() => {
    if (!grid) {
      return;
    }
    let cancelled = false;
    fetchNeighbors(grid.gridId, atomI, rCut)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setNeighbors(result.neighbors);
        setAtomJ(result.neighbors[0]?.index ?? null);
      })
      .catch((caught) => {
        if (!cancelled) {
          setNeighbors([]);
          setAtomJ(null);
          onError(errorMessage(caught, "Neighbor lookup failed."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [grid, atomI, rCut, onError]);

  // Recompute the isosurface mesh when the level changes (debounced).
  useEffect(() => {
    if (!grid) {
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setIsoStatus("loading");
      fetchIsosurface(grid.gridId, isoLevel)
        .then((mesh) => {
          if (!cancelled) {
            setIsoMesh(mesh);
            setIsoStatus("ready");
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setIsoStatus("error");
            onError(errorMessage(caught, "Isosurface computation failed."));
          }
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [grid, isoLevel, onError]);

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
      if (!grid) {
        return;
      }
      setSliceAxis(axis);
      setSliceIndex(index);
      try {
        setSlice(await fetchChgcarSlice(grid.gridId, axis, index));
      } catch (caught) {
        onError(errorMessage(caught, "Slice request failed."));
      }
    },
    [grid, onError],
  );

  const recomputeLed = useCallback(
    async (nextThreshold: number) => {
      if (!grid) {
        return;
      }
      try {
        const result = await fetchChgcarLed(grid.gridId, nextThreshold);
        setLedFraction(result.ledFraction);
        setLedCurve({ density: result.density, percent: result.percent });
      } catch (caught) {
        onError(errorMessage(caught, "LED recomputation failed."));
      }
    },
    [grid, onError],
  );

  const computeProfile = useCallback(async () => {
    if (!grid || atomJ === null || atomI === atomJ) {
      return;
    }
    setProfileStatus("loading");
    try {
      setProfile(await fetchLineProfile(grid.gridId, atomI, atomJ, profileRadius));
      setProfileStatus("ready");
    } catch (caught) {
      setProfileStatus("error");
      onError(errorMessage(caught, "Bonding-path profile failed."));
    }
  }, [grid, atomI, atomJ, profileRadius, onError]);

  const sliceCardRef = useRef<HTMLElement>(null);
  const sliceCount = slice?.count ?? 1;
  const vminValue = Number(vmin) || 0;
  const vmaxValue = Number(vmax) || 1;
  const distributionValueLabel = grid?.valueLabel ?? (isChgcar ? "ρ / ρ̄" : "ELF");

  const sliceCsvColumns = (): CsvColumn[] => {
    if (!slice || slice.matrix.length === 0) {
      return [];
    }
    const cols = slice.matrix[0]?.length ?? 0;
    return Array.from({ length: cols }, (_, colIndex) => ({
      header: `${slice.colAxis}[${colIndex}]`,
      values: slice.matrix.map((row) => row[colIndex] ?? ""),
    }));
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-bold text-muted-foreground">{title}</h3>
        <UploadButton
          label={status === "loading" ? `Loading ${title}…` : `Load ${title}`}
          disabled={status === "loading"}
          onFile={(file) => void load(file)}
        />
        {grid ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {grid.symbols.join(" ")} · {grid.atomCount} atoms · grid {grid.grid.nx}×
              {grid.grid.ny}×{grid.grid.nz}
              {isChgcar ? ` · ${grid.totalElectrons.toFixed(1)} e⁻` : ""}
            </p>
            <button
              className="shrink-0 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-foreground/5"
              onClick={unload}
            >
              Unload
            </button>
          </div>
        ) : null}
      </section>

      {grid ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">
              {isChgcar ? "Electron cloud (isosurface)" : "ELF isosurface"}
            </h3>
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
              max={Number(Math.max(0.1, grid.densityRange.max).toFixed(2))}
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
        <section ref={sliceCardRef} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">
              {isChgcar ? "Density slice (ρ / ρ̄)" : "ELF slice"}
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1">
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
              <ChartExportButtons
                targetRef={sliceCardRef}
                fileStem={slugify(`${title} ${isChgcar ? "density" : "elf"} slice`)}
                csvColumns={sliceCsvColumns}
              />
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
              <input
                aria-label="value vmin"
                value={vmin}
                className={NUMBER_INPUT_CLASS}
                onChange={(e) => setVmin(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1">
              max
              <input
                aria-label="value vmax"
                value={vmax}
                className={NUMBER_INPUT_CLASS}
                onChange={(e) => setVmax(e.target.value)}
              />
            </label>
          </div>
        </section>
      ) : null}

      {/* Bonding-path profile: value along the line between two atoms. */}
      {grid ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
          <h3 className="text-[13px] font-semibold">Bonding-path profile</h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {distributionValueLabel} averaged inside a cylinder along the line joining two atoms,
            vs. distance from the first. The second atom is picked from the neighbors of the first
            within the cutoff.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <select
              aria-label="first atom"
              value={atomI}
              className="h-7 rounded border border-border bg-background px-1 font-mono text-[11px]"
              onChange={(event) => setAtomI(Number(event.currentTarget.value))}
            >
              {grid.atoms.map((atom) => (
                <option key={atom.index} value={atom.index}>
                  {atom.label}
                </option>
              ))}
            </select>
            <span>→</span>
            <select
              aria-label="second atom"
              value={atomJ ?? ""}
              disabled={neighbors.length === 0}
              className="h-7 min-w-24 rounded border border-border bg-background px-1 font-mono text-[11px] disabled:opacity-50"
              onChange={(event) => setAtomJ(Number(event.currentTarget.value))}
            >
              {neighbors.length === 0 ? (
                <option value="">no neighbor</option>
              ) : (
                neighbors.map((neighbor) => (
                  <option key={neighbor.index} value={neighbor.index}>
                    {neighbor.label} ({neighbor.distance.toFixed(2)} Å)
                  </option>
                ))
              )}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={atomJ === null || profileStatus === "loading"}
              onClick={() => void computeProfile()}
            >
              {profileStatus === "loading" ? "computing…" : "plot"}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            R_cutoff {rCut.toFixed(1)} Å
            <input
              type="range"
              min={1.5}
              max={6}
              step={0.1}
              value={rCut}
              className="h-1 flex-1 accent-foreground"
              onChange={(event) => setRCut(Number(event.currentTarget.value))}
            />
            <span className="font-mono">{neighbors.length} nbrs</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            radius {profileRadius.toFixed(2)} Å
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={profileRadius}
              className="h-1 flex-1 accent-foreground"
              onChange={(event) => setProfileRadius(Number(event.currentTarget.value))}
            />
          </label>
          {profile && profile.r.length > 0 ? (
            <>
              <p className="text-[10px] text-muted-foreground">
                {profile.labelI} → {profile.labelJ} · bond {profile.bondLength.toFixed(2)} Å ·{" "}
                {profile.voxelCount.toLocaleString()} voxels
              </p>
              <LineChartCard
                title={`${profile.labelI}–${profile.labelJ} profile`}
                xLabel="distance r (Å)"
                yLabel={profile.valueLabel}
                series={[{ label: `${profile.labelI}–${profile.labelJ}`, x: profile.r, y: profile.value }]}
              />
            </>
          ) : profile ? (
            <p className="text-[11px] text-muted-foreground">
              No voxels fell inside the cylinder — try a larger radius.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Distribution: LED curve for CHGCAR, value histogram for ELFCAR. */}
      {isChgcar && ledCurve ? (
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

      {!isChgcar && histogram ? (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Distribution of ELF values across the grid (mean {histogram.mean.toFixed(3)}). ELF near
            1 marks strongly localized electrons (bonds, lone pairs); near 0 marks delocalized
            regions.
          </p>
          <LineChartCard
            title="ELF value distribution"
            xLabel="ELF"
            yLabel="grid points (%)"
            series={[{ label: "ELF", x: histogram.value, y: histogram.percent }]}
          />
        </section>
      ) : null}
    </div>
  );
}
