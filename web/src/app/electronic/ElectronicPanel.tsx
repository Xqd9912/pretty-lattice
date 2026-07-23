import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ELECTRONIC_PANEL_MIN_WIDTH_PX } from "../../model/layout";
import type { SceneSpec } from "../../api/scene";
import type { IsosurfaceOverlay } from "../../scene/DensityIsosurface";

import {
  fetchVasprunIprStateContributions,
  uploadDos,
  uploadVasprun,
  type DosResponse,
  type ElectronicDosSeries,
  type IprResponse,
  type VasprunResponse,
} from "../../api/electronic";
import { DosIprCard } from "./DosIprCard";
import { ElectronicDosCard } from "./ElectronicDosCard";
import { LobsterSection } from "./LobsterSection";
import { VolumetricSection } from "./VolumetricSection";

type Status = "idle" | "loading" | "ready" | "error";

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
  onIprSceneLoad,
  onIprApply,
  onIprClear,
  onIprColor,
  iprSessionVersion = 0,
  structureSelectedOnly,
  structureSelectedSiteIndices,
  structureVisibleSiteIndices,
}: {
  isOpen: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  rightOffset: number;
  onResizeActiveChange: (active: boolean) => void;
  onDensitySceneChange: (next: { scene: SceneSpec; fileName: string } | null) => void;
  onIsosurfaceChange: (overlay: IsosurfaceOverlay | null) => void;
  onIprSceneLoad?: (next: { scene: SceneSpec; fileName: string }) => void;
  onIprApply?: (siteIndices: readonly number[]) => void;
  onIprClear?: () => void;
  onIprColor?: (values: ReadonlyMap<number, number> | null) => void;
  /** Increment when a non-IPR scene replaces the current structure. */
  iprSessionVersion?: number;
  structureSelectedOnly?: boolean;
  structureSelectedSiteIndices?: ReadonlySet<number>;
  structureVisibleSiteIndices?: ReadonlySet<number>;
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

  // One active electronic dataset: TDOS.dat or capability-based vasprun.xml.
  const [electronicStatus, setElectronicStatus] = useState<Status>("idle");
  const [dos, setDos] = useState<DosResponse | null>(null);
  const [vasprun, setVasprun] = useState<VasprunResponse | null>(null);
  const [showIpr, setShowIpr] = useState(true);
  const iprLoadGenerationRef = useRef(0);
  const iprUploadAbortRef = useRef<AbortController | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadDos = useCallback(async (file: File) => {
    iprUploadAbortRef.current?.abort();
    iprLoadGenerationRef.current += 1;
    setElectronicStatus("loading");
    setError(null);
    try {
      setDos(await uploadDos(file));
      setVasprun(null);
      setElectronicStatus("ready");
      onIprClear?.();
      onIprColor?.(null);
    } catch (caught) {
      setElectronicStatus("error");
      setError(errorMessage(caught, "DOS load failed."));
    }
  }, [onIprClear, onIprColor]);

  useEffect(() => {
    iprUploadAbortRef.current?.abort();
    iprUploadAbortRef.current = null;
    iprLoadGenerationRef.current += 1;
    setElectronicStatus("idle");
    setVasprun(null);
    setError(null);
  }, [iprSessionVersion]);

  useEffect(
    () => () => {
      iprLoadGenerationRef.current += 1;
      iprUploadAbortRef.current?.abort();
      iprUploadAbortRef.current = null;
    },
    [],
  );

  const loadIpr = useCallback(async (file: File) => {
    iprUploadAbortRef.current?.abort();
    const controller = new AbortController();
    iprUploadAbortRef.current = controller;
    const generation = iprLoadGenerationRef.current + 1;
    iprLoadGenerationRef.current = generation;
    setElectronicStatus("loading");
    setError(null);
    onIprColor?.(null);
    try {
      const result = await uploadVasprun(file, controller.signal);
      if (iprLoadGenerationRef.current !== generation) {
        return;
      }
      setVasprun(result);
      setDos(null);
      setShowIpr(result.capabilities.ipr.available);
      setElectronicStatus("ready");
      onIprSceneLoad?.({ scene: result.scene, fileName: file.name });
    } catch (caught) {
      if (
        iprLoadGenerationRef.current !== generation ||
        (caught instanceof Error && caught.name === "AbortError")
      ) {
        return;
      }
      setElectronicStatus("error");
      setError(errorMessage(caught, "vasprun.xml load failed."));
    } finally {
      if (iprUploadAbortRef.current === controller) {
        iprUploadAbortRef.current = null;
      }
    }
  }, [onIprColor, onIprSceneLoad]);

  const tdosSeries: ElectronicDosSeries[] = dos?.channels.map((channel, index) => ({
    id: `tdos:${index}`,
    label: channel.label,
    kind: "tdos",
    spin: channel.label.toLowerCase().includes("down") ? "down" : "up",
    values: channel.values,
  })) ?? [];
  const compatibleIpr: IprResponse | null = vasprun?.capabilities.ipr.available
    ? {
        iprId: vasprun.electronicId,
        efermi: vasprun.efermi,
        aggregation: vasprun.ipr.aggregation,
        dos: {
          energy: vasprun.energy,
          total: vasprun.dosSeries.find((entry) => entry.spin === "up")?.values
            ?? vasprun.energy.map(() => 0),
        },
        scene: vasprun.scene,
        states: vasprun.ipr.states,
        warnings: [],
      }
    : null;

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

          {/* Charge density (CHGCAR): slice, isosurface, LED distribution, profile. */}
          <VolumetricSection
            kind="chgcar"
            title="CHGCAR"
            onDensitySceneChange={onDensitySceneChange}
            onIsosurfaceChange={onIsosurfaceChange}
            onError={setError}
          />

          {/* Electron localization (ELFCAR): reuses the same volumetric pipeline. */}
          <VolumetricSection
            kind="elfcar"
            title="ELFCAR"
            onDensitySceneChange={onDensitySceneChange}
            onIsosurfaceChange={onIsosurfaceChange}
            onError={setError}
          />

          {/* LOBSTER: BWDF + ICOHP/ICOOP per-bond scatter plots. */}
          <LobsterSection onError={setError} />

          <section className="flex flex-col gap-2 rounded-lg border border-border p-2">
            <h3 className="text-[13px] font-bold text-muted-foreground">
              DOS / Electronic structure
            </h3>
            <div className="flex flex-wrap gap-2">
            <UploadButton
              label={electronicStatus === "loading" ? "Loading…" : "Load TDOS.dat"}
              disabled={electronicStatus === "loading"}
              onFile={(file) => void loadDos(file)}
            />
            <UploadButton
              label={electronicStatus === "loading" ? "Loading…" : "Load vasprun.xml"}
              disabled={electronicStatus === "loading"}
              onFile={(file) => void loadIpr(file)}
            />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Loading a source replaces the current DOS/electronic dataset.
            </p>
          </section>

          {dos ? (
            <ElectronicDosCard
              energy={dos.energy}
              series={tdosSeries}
            />
          ) : null}

          {vasprun && (vasprun.capabilities.dos.available || vasprun.capabilities.pdos.available) ? (
            <ElectronicDosCard
              electronicId={vasprun.electronicId}
              energy={vasprun.energy}
              series={[...vasprun.dosSeries, ...vasprun.pdosSeries]}
              selectedSiteIndices={structureSelectedSiteIndices}
              sitePdosCapability={vasprun.capabilities.sitePdos}
              onError={setError}
            />
          ) : null}

          {vasprun && !vasprun.capabilities.dos.available && vasprun.capabilities.pdos.available ? (
            <p className="text-[10px] text-amber-700">
              TDOS unavailable: {vasprun.capabilities.dos.reason}
            </p>
          ) : null}
          {vasprun && !vasprun.capabilities.pdos.available ? (
            <p className="text-[10px] text-amber-700">
              PDOS unavailable: {vasprun.capabilities.pdos.reason}
            </p>
          ) : null}

          {vasprun && !vasprun.capabilities.dos.available && !vasprun.capabilities.pdos.available ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-800">
              DOS unavailable: {vasprun.capabilities.dos.reason ?? vasprun.capabilities.pdos.reason}
            </p>
          ) : null}

          {vasprun ? (
            <section className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[12px] font-semibold">
                <input
                  type="checkbox"
                  checked={showIpr}
                  disabled={!vasprun.capabilities.ipr.available}
                  className="size-3 accent-foreground"
                  onChange={(event) => setShowIpr(event.currentTarget.checked)}
                />
                IPR
              </label>
              {!vasprun.capabilities.ipr.available ? (
                <p className="text-[10px] text-amber-700">
                  {vasprun.capabilities.ipr.reason}
                </p>
              ) : null}
            </section>
          ) : null}

          {compatibleIpr && showIpr ? (
            <DosIprCard
              key={compatibleIpr.iprId}
              ipr={compatibleIpr}
              fetchContributions={fetchVasprunIprStateContributions}
              onApplyToStructure={(siteIndices) => onIprApply?.(siteIndices)}
              onClearFromStructure={() => onIprClear?.()}
              onColorStructure={onIprColor}
              structureSelectedOnly={structureSelectedOnly}
              structureSelectedSiteIndices={structureSelectedSiteIndices}
              structureVisibleSiteIndices={structureVisibleSiteIndices}
            />
          ) : null}
          {vasprun?.warnings?.length ? (
            <ul className="list-disc pl-4 text-[10px] text-amber-700">
              {vasprun.warnings.map((warning, index) => (
                <li key={`${index}:${warning}`}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
