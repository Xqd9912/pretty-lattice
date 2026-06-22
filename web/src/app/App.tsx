import { FolderOpen, PanelRightClose, SlidersHorizontal } from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { uploadStructurePreview, type SceneSpec } from "../api/scene";
import { LatticeScene, type PreviewSafeArea } from "../scene/LatticeScene";
import {
  hasPeriodicImageAtoms,
  previewSafeAreaForSettings,
  visibleSceneForBoundaryAtoms,
} from "./settings";
import { deriveElementLegendEntries, type ElementLegendEntry } from "./elementLegend";
import { summarizeScene, type PreviewStatus } from "./previewState";
import { renderHermannMauguin } from "./symmetryNotation";

const GLASS_SURFACE_CLASS =
  "border-foreground/10 bg-card/72 backdrop-blur-2xl backdrop-saturate-150";

export function App() {
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showBoundaryAtoms, setShowBoundaryAtoms] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    setPreviewStatus("loading");
    setErrorMessage(null);
    setScene(null);
    setIsSettingsOpen(false);
    setShowBoundaryAtoms(false);

    try {
      const nextScene = await uploadStructurePreview(file);
      setScene(nextScene);
      setShowBoundaryAtoms(hasPeriodicImageAtoms(nextScene));
      setPreviewStatus("ready");
    } catch (error) {
      setScene(null);
      setIsSettingsOpen(false);
      setPreviewStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not parse structure.");
    }
  }

  const summary = useMemo(() => summarizeScene(scene), [scene]);
  const legendEntries = useMemo(() => deriveElementLegendEntries(scene), [scene]);
  const visibleScene = useMemo(
    () => visibleSceneForBoundaryAtoms(scene, showBoundaryAtoms),
    [scene, showBoundaryAtoms],
  );
  const previewSafeArea = previewSafeAreaForSettings();

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <section className="scene-stage absolute inset-0" aria-label="Crystal structure preview">
        {visibleScene ? (
          <LatticeScene scene={visibleScene} safeArea={previewSafeArea} />
        ) : (
          <div
            className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground"
            data-state={previewStatus}
          >
            {previewStatus === "loading" ? "Loading structure" : "No structure loaded"}
          </div>
        )}
      </section>

      {legendEntries.length > 0 ? (
        <ElementLegend entries={legendEntries} safeArea={previewSafeArea} />
      ) : null}

      <aside
        className={cn(
          "absolute left-4 top-4 w-[312px] max-w-[calc(100vw-2rem)] rounded-lg border p-3 shadow-xl shadow-foreground/10",
          GLASS_SURFACE_CLASS,
          isSettingsOpen ? "max-[760px]:hidden" : null,
        )}
        aria-label="Current structure"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <img
              src="/favicon.svg"
              alt=""
              className="size-7 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="truncate text-[0.95rem] font-semibold leading-tight">Pretty Lattice</h1>
            </div>
          </div>

          <Button
            size="sm"
            aria-label="Open structure"
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs transition-[background-color,color,box-shadow,translate] duration-200 ease-out hover:-translate-y-px hover:shadow-md active:translate-y-0 disabled:translate-y-0 [&_svg]:size-3.5"
            disabled={previewStatus === "loading"}
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderOpen data-icon="inline-start" aria-hidden="true" />
            <span>Open</span>
          </Button>
        </div>

        <Separator className="my-2" />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => void handleFileChange(event)}
        />

        <SummaryRow
          label="File"
          value={selectedFileName ?? "No file selected"}
          valueClassName="font-normal"
          title={selectedFileName ?? undefined}
        />

        {errorMessage ? (
          <div
            className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 font-mono text-sm leading-snug text-destructive"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {scene ? (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <SummaryRow
                label="Formula"
                value={renderFormula(summary.formula)}
                mono={false}
              />
              <SummaryRow label="Atoms" value={summary.atomCount} />
            </div>

            <Separator />
            <div>
              <span className="block text-xs font-bold text-muted-foreground">Symmetry</span>
              {summary.symmetry?.available ? (
                <dl className="mt-1 flex flex-col gap-1 text-sm">
                  <SymmetryMetric
                    label="Space group"
                    value={renderSpaceGroup(
                      summary.symmetry.spaceGroup,
                      summary.symmetry.spaceGroupNumber,
                    )}
                    title={formatSpaceGroupTitle(
                      summary.symmetry.spaceGroup,
                      summary.symmetry.spaceGroupNumber,
                    )}
                  />
                  <SymmetryMetric
                    label="Point group"
                    value={renderPointGroup(
                      summary.symmetry.pointGroup,
                      summary.symmetry.pointGroupSchoenflies,
                    )}
                    title={formatPointGroupTitle(
                      summary.symmetry.pointGroup,
                      summary.symmetry.pointGroupSchoenflies,
                    )}
                  />
                  <SymmetryMetric
                    label="Crystal system"
                    value={summary.symmetry.crystalSystem ?? "-"}
                  />
                  <SymmetryMetric
                    label="Lattice system"
                    value={summary.symmetry.latticeSystem ?? "-"}
                  />
                </dl>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Symmetry unavailable</p>
              )}
            </div>

            {summary.cell ? (
              <>
                <Separator />
                <div>
                  <span className="block text-xs font-bold text-muted-foreground">
                    Lattice Parameters
                  </span>
                  <dl className="mt-1 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-sm">
                    <CellMetric label="a" value={summary.cell.a} unit="Å" />
                    <CellMetric label="b" value={summary.cell.b} unit="Å" />
                    <CellMetric label="c" value={summary.cell.c} unit="Å" />
                    <CellMetric label="α" value={summary.cell.alpha} unit="°" />
                    <CellMetric label="β" value={summary.cell.beta} unit="°" />
                    <CellMetric label="γ" value={summary.cell.gamma} unit="°" />
                  </dl>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </aside>

      {scene ? (
        <>
          <SettingsTrigger
            isOpen={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
          />

          <SettingsDrawer
            isOpen={isSettingsOpen}
            showBoundaryAtoms={showBoundaryAtoms}
            onOpenChange={setIsSettingsOpen}
            onShowBoundaryAtomsChange={setShowBoundaryAtoms}
          />
        </>
      ) : null}
    </main>
  );
}

function SettingsTrigger({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-controls="settings-drawer"
            aria-expanded={isOpen}
            aria-label="Open settings"
            className={cn(
              "absolute right-4 top-4 rounded-full shadow-xl shadow-foreground/10 transition-[opacity,translate] duration-200 ease-out hover:-translate-x-0.5",
              GLASS_SURFACE_CLASS,
              isOpen ? "pointer-events-none translate-x-1 opacity-0" : "opacity-100",
            )}
            onClick={() => onOpenChange(true)}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Settings</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SettingsDrawer({
  isOpen,
  onOpenChange,
  onShowBoundaryAtomsChange,
  showBoundaryAtoms,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onShowBoundaryAtomsChange: (showBoundaryAtoms: boolean) => void;
  showBoundaryAtoms: boolean;
}) {
  return (
    <>
      <aside
        id="settings-drawer"
        aria-labelledby="settings-drawer-title"
        aria-hidden={!isOpen}
        className={cn(
          "absolute inset-y-0 right-0 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-l shadow-2xl shadow-foreground/10",
          GLASS_SURFACE_CLASS,
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          isOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center px-4 pr-16">
          <h2 id="settings-drawer-title" className="text-[0.95rem] font-semibold leading-tight">
            Settings
          </h2>
        </div>

        <Separator />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5",
              GLASS_SURFACE_CLASS,
            )}
          >
            <label
              htmlFor="boundary-atoms-switch"
              className="min-w-0 truncate text-sm font-medium leading-tight"
            >
              Show boundary atom images
            </label>
            <Switch
              id="boundary-atoms-switch"
              checked={showBoundaryAtoms}
              disabled={!isOpen}
              onCheckedChange={onShowBoundaryAtomsChange}
            />
          </div>
        </div>
      </aside>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-controls="settings-drawer"
              aria-expanded={isOpen}
              aria-label="Collapse settings"
              className={cn(
                "absolute right-4 top-4 rounded-full shadow-xl shadow-foreground/10 transition-[opacity,translate] duration-200 ease-out hover:-translate-x-0.5",
                GLASS_SURFACE_CLASS,
                isOpen ? "opacity-100" : "pointer-events-none translate-x-1 opacity-0",
              )}
              tabIndex={isOpen ? undefined : -1}
              onClick={() => onOpenChange(false)}
            >
              <PanelRightClose data-icon="inline-start" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Collapse</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}

function ElementLegend({
  entries,
  safeArea,
}: {
  entries: ElementLegendEntry[];
  safeArea: PreviewSafeArea;
}) {
  return (
    <nav
      aria-label="Element legend"
      className={cn(
        "pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-full border px-4 py-2 shadow-lg shadow-foreground/10",
        GLASS_SURFACE_CLASS,
      )}
      style={legendContainerStyle(safeArea)}
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {entries.map((entry) => (
          <li key={entry.element} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="size-[18px] shrink-0 rounded-full border border-foreground/10 shadow-sm"
              style={legendSphereStyle(entry.color)}
            />
            <span className="font-sans text-[0.95rem] font-normal leading-none text-foreground">
              {entry.element}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function legendContainerStyle(safeArea: PreviewSafeArea): CSSProperties {
  return {
    left: `calc(50% + ${(safeArea.left - safeArea.right) / 2}px)`,
    maxWidth: `min(calc(100vw - ${safeArea.left + safeArea.right + 32}px), 760px)`,
  };
}

function legendSphereStyle(color: string): CSSProperties {
  return {
    background: `radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.96) 0 8%, ${color} 36%, ${color} 72%, rgba(0, 0, 0, 0.42) 100%)`,
  };
}

function SummaryRow({
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

function SymmetryMetric({
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

function renderSpaceGroup(spaceGroup: string | null, spaceGroupNumber: number | null) {
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

function formatSpaceGroupTitle(spaceGroup: string | null, spaceGroupNumber: number | null) {
  const symbol = spaceGroup ?? "-";
  return spaceGroupNumber === null ? symbol : `${symbol}  (No. ${spaceGroupNumber})`;
}

function renderPointGroup(pointGroup: string | null, schoenflies: string | null) {
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

function formatPointGroupTitle(pointGroup: string | null, schoenflies: string | null) {
  const symbol = pointGroup ?? "-";
  return schoenflies ? `${symbol}  (${schoenflies})` : symbol;
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

function renderFormula(formula: string) {
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

function CellMetric({
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
