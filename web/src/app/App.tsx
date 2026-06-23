import {
  FolderOpen,
  Lock,
  PanelRightClose,
  RotateCcw,
  SlidersHorizontal,
  Unlock,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
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
import {
  INTERACTION_MODE_OPTIONS,
  formatZoomPercent,
  parseZoomPercentInput,
  resetPreviewViewState,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewViewScale,
  sliderPositionToViewScale,
  snapZoomSliderPosition,
  viewScaleToSliderPosition,
  createPreviewViewState,
  type InteractionMode,
} from "./viewState";

const GLASS_SURFACE_CLASS =
  "border-foreground/10 bg-card/72 backdrop-blur-2xl backdrop-saturate-150";
const LOCKED_INTERACTION_DRAG_THRESHOLD_PX = 4;
const LOCKED_INTERACTION_FEEDBACK_ANIMATION_MS = 420;
const LOCKED_INTERACTION_WHEEL_IDLE_MS = 150;
const RESET_VIEW_FEEDBACK_ANIMATION_MS = 150;
const ZOOM_SLIDER_BLUR_DELAY_MS = 1000;
const ZOOM_SLIDER_HEIGHT_PX = 200;
const ZOOM_SLIDER_THUMB_SIZE_PX = 14;

interface LockedInteractionPointer {
  pointerId: number;
  startX: number;
  startY: number;
  triggered: boolean;
}

export function App() {
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showBoundaryAtoms, setShowBoundaryAtoms] = useState(false);
  const [viewState, setViewState] = useState(createPreviewViewState);
  const [lockedInteractionFeedbackCount, setLockedInteractionFeedbackCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lockedInteractionPointerRef = useRef<LockedInteractionPointer | null>(null);
  const lockedInteractionWheelIdleTimeoutRef = useRef<number | null>(null);

  const handleViewScaleChange = useCallback((viewScale: number) => {
    setViewState((currentViewState) => setPreviewViewScale(currentViewState, viewScale));
  }, []);

  const handleInteractionModeChange = useCallback((interactionMode: InteractionMode) => {
    setViewState((currentViewState) =>
      setPreviewInteractionMode(currentViewState, interactionMode),
    );
  }, []);

  const handleInteractionLockedChange = useCallback((interactionLocked: boolean) => {
    setViewState((currentViewState) =>
      setPreviewInteractionLocked(currentViewState, interactionLocked),
    );
  }, []);

  const handleResetView = useCallback(() => {
    setViewState(resetPreviewViewState);
  }, []);

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
    setViewState(createPreviewViewState());

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
  const hasVisibleScene = visibleScene !== null;
  const previewSafeArea = previewSafeAreaForSettings();
  const triggerLockedInteractionFeedback = useCallback(() => {
    setLockedInteractionFeedbackCount((count) => count + 1);
  }, []);

  const clearLockedInteractionWheelGate = useCallback(() => {
    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    lockedInteractionWheelIdleTimeoutRef.current = null;
  }, []);

  useEffect(() => () => clearLockedInteractionWheelGate(), [clearLockedInteractionWheelGate]);

  useEffect(() => {
    if (!hasVisibleScene || !viewState.interactionLocked) {
      clearLockedInteractionWheelGate();
    }
  }, [clearLockedInteractionWheelGate, hasVisibleScene, viewState.interactionLocked]);

  const handleSceneWheelCapture = useCallback(() => {
    if (!hasVisibleScene || !viewState.interactionLocked) {
      clearLockedInteractionWheelGate();
      return;
    }

    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      triggerLockedInteractionFeedback();
    } else {
      window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    }

    lockedInteractionWheelIdleTimeoutRef.current = window.setTimeout(() => {
      lockedInteractionWheelIdleTimeoutRef.current = null;
    }, LOCKED_INTERACTION_WHEEL_IDLE_MS);
  }, [
    clearLockedInteractionWheelGate,
    hasVisibleScene,
    triggerLockedInteractionFeedback,
    viewState.interactionLocked,
  ]);

  const handleScenePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!hasVisibleScene || !viewState.interactionLocked || event.button !== 0) {
        lockedInteractionPointerRef.current = null;
        return;
      }

      lockedInteractionPointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        triggered: false,
      };
    },
    [hasVisibleScene, viewState.interactionLocked],
  );

  const handleScenePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const lockedPointer = lockedInteractionPointerRef.current;
      if (
        !hasVisibleScene ||
        !viewState.interactionLocked ||
        !lockedPointer ||
        lockedPointer.pointerId !== event.pointerId ||
        lockedPointer.triggered
      ) {
        return;
      }

      const dragDistance = Math.hypot(
        event.clientX - lockedPointer.startX,
        event.clientY - lockedPointer.startY,
      );
      if (dragDistance < LOCKED_INTERACTION_DRAG_THRESHOLD_PX) {
        return;
      }

      lockedPointer.triggered = true;
      triggerLockedInteractionFeedback();
    },
    [hasVisibleScene, triggerLockedInteractionFeedback, viewState.interactionLocked],
  );

  const handleScenePointerEndCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (lockedInteractionPointerRef.current?.pointerId === event.pointerId) {
      lockedInteractionPointerRef.current = null;
    }
  }, []);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <section
        className="scene-stage absolute inset-0"
        aria-label="Crystal structure preview"
        onPointerCancelCapture={handleScenePointerEndCapture}
        onPointerDownCapture={handleScenePointerDownCapture}
        onPointerMoveCapture={handleScenePointerMoveCapture}
        onPointerUpCapture={handleScenePointerEndCapture}
        onWheelCapture={handleSceneWheelCapture}
      >
        {visibleScene ? (
          <LatticeScene
            interactionLocked={viewState.interactionLocked}
            interactionMode={viewState.interactionMode}
            onViewScaleChange={handleViewScaleChange}
            resetCounter={viewState.resetCounter}
            safeArea={previewSafeArea}
            scene={visibleScene}
            viewScale={viewState.viewScale}
          />
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
          "absolute left-4 top-4 w-[312px] max-w-[calc(100vw-2rem)] rounded-xl border px-3 py-3.5 shadow-xl shadow-foreground/10",
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

        <Separator className="my-2.5" />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => void handleFileChange(event)}
        />

        <div className="flex flex-col gap-1">
          <SummaryRow
            label="File"
            value={selectedFileName ?? "No file selected"}
            title={selectedFileName ?? undefined}
          />

          {scene ? (
            <>
              <SummaryRow
                label="Formula"
                value={renderFormula(summary.formula)}
                mono={false}
              />
              <SummaryRow label="Atoms" value={summary.atomCount} />
            </>
          ) : null}
        </div>

        {errorMessage ? (
          <div
            className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 font-mono text-sm leading-snug text-destructive"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {scene ? (
          <div className="mt-2.5 flex flex-col gap-2.5">
            <Separator />
            <div>
              <span className="block text-xs font-bold text-muted-foreground">Symmetry</span>
              {summary.symmetry?.available ? (
                <dl className="mt-1.5 flex flex-col gap-1 text-sm">
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
                  <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-sm">
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
          <ViewControlRail
            className={cn(isSettingsOpen ? "max-[760px]:hidden" : null)}
            interactionLocked={viewState.interactionLocked}
            lockedInteractionFeedbackCount={lockedInteractionFeedbackCount}
            onInteractionLockedChange={handleInteractionLockedChange}
            onResetView={handleResetView}
            onViewScaleChange={handleViewScaleChange}
            viewScale={viewState.viewScale}
          />

          <SettingsTrigger
            isOpen={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
          />

          <SettingsDrawer
            interactionMode={viewState.interactionMode}
            isOpen={isSettingsOpen}
            onInteractionModeChange={handleInteractionModeChange}
            showBoundaryAtoms={showBoundaryAtoms}
            onOpenChange={setIsSettingsOpen}
            onShowBoundaryAtomsChange={setShowBoundaryAtoms}
          />
        </>
      ) : null}
    </main>
  );
}

function ViewControlRail({
  className,
  interactionLocked,
  lockedInteractionFeedbackCount,
  onInteractionLockedChange,
  onResetView,
  onViewScaleChange,
  viewScale,
}: {
  className?: string;
  interactionLocked: boolean;
  lockedInteractionFeedbackCount: number;
  onInteractionLockedChange: (interactionLocked: boolean) => void;
  onResetView: () => void;
  onViewScaleChange: (viewScale: number) => void;
  viewScale: number;
}) {
  const [lockFeedbackPhase, setLockFeedbackPhase] = useState<"a" | "b" | null>(null);
  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const [zoomText, setZoomText] = useState(formatZoomPercent(viewScale));
  const lastLockFeedbackCountRef = useRef(0);
  const lockFeedbackTimeoutRef = useRef<number | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
  const zoomSliderRef = useRef<HTMLInputElement>(null);
  const zoomSliderBlurTimeoutRef = useRef<number | null>(null);
  const isZoomSliderPointerActiveRef = useRef(false);
  const sliderPosition = viewScaleToSliderPosition(viewScale);
  const sliderValue = Math.round(sliderPosition * 1000);
  const sliderThumbTravelPx = ZOOM_SLIDER_HEIGHT_PX - ZOOM_SLIDER_THUMB_SIZE_PX;
  const sliderThumbTopPx =
    ZOOM_SLIDER_THUMB_SIZE_PX / 2 + (1 - sliderPosition) * sliderThumbTravelPx;
  const sliderStyle = {
    "--zoom-slider-thumb-top": `${sliderThumbTopPx}px`,
  } as CSSProperties;

  useEffect(() => {
    setZoomText(formatZoomPercent(viewScale));
  }, [viewScale]);

  useEffect(
    () => () => {
      if (lockFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(lockFeedbackTimeoutRef.current);
      }
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
      if (zoomSliderBlurTimeoutRef.current !== null) {
        window.clearTimeout(zoomSliderBlurTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      lockedInteractionFeedbackCount === 0 ||
      lockedInteractionFeedbackCount === lastLockFeedbackCountRef.current
    ) {
      return;
    }

    lastLockFeedbackCountRef.current = lockedInteractionFeedbackCount;
    if (!interactionLocked) {
      return;
    }

    if (lockFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(lockFeedbackTimeoutRef.current);
    }

    setLockFeedbackPhase(lockedInteractionFeedbackCount % 2 === 0 ? "b" : "a");
    lockFeedbackTimeoutRef.current = window.setTimeout(() => {
      setLockFeedbackPhase(null);
      lockFeedbackTimeoutRef.current = null;
    }, LOCKED_INTERACTION_FEEDBACK_ANIMATION_MS);
  }, [interactionLocked, lockedInteractionFeedbackCount]);

  useEffect(() => {
    if (!interactionLocked) {
      setLockFeedbackPhase(null);
    }
  }, [interactionLocked]);

  function handleResetClick() {
    onResetView();

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, RESET_VIEW_FEEDBACK_ANIMATION_MS);
  }

  function clearZoomSliderBlurTimeout() {
    if (zoomSliderBlurTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(zoomSliderBlurTimeoutRef.current);
    zoomSliderBlurTimeoutRef.current = null;
  }

  function scheduleZoomSliderBlur() {
    clearZoomSliderBlurTimeout();
    zoomSliderBlurTimeoutRef.current = window.setTimeout(() => {
      zoomSliderRef.current?.blur();
      isZoomSliderPointerActiveRef.current = false;
      zoomSliderBlurTimeoutRef.current = null;
    }, ZOOM_SLIDER_BLUR_DELAY_MS);
  }

  function handleZoomSliderPointerDown() {
    isZoomSliderPointerActiveRef.current = true;
    clearZoomSliderBlurTimeout();
  }

  function handleZoomSliderPointerEnd() {
    if (isZoomSliderPointerActiveRef.current) {
      scheduleZoomSliderBlur();
    }
  }

  function commitZoomText() {
    const nextScale = parseZoomPercentInput(zoomText);
    if (nextScale === null) {
      setZoomText(formatZoomPercent(viewScale));
      return;
    }

    onViewScaleChange(nextScale);
  }

  function handleZoomKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitZoomText();
      return;
    }

    if (event.key === "Escape") {
      setZoomText(formatZoomPercent(viewScale));
      event.currentTarget.blur();
    }
  }

  return (
    <TooltipProvider>
      <aside
        aria-label="View controls"
        className={cn(
          "absolute left-[340px] top-4 flex w-12 flex-col items-center gap-1.5 max-[760px]:bottom-[8.5rem] max-[760px]:left-auto max-[760px]:right-4 max-[760px]:top-auto",
          className,
        )}
      >
        <div
          className={cn(
            "flex w-[42px] flex-col items-center gap-1.5 rounded-full border px-1 pb-2.5 pt-2.5 shadow-xl shadow-foreground/10",
            GLASS_SURFACE_CLASS,
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reset view"
                className={cn(
                  "view-rail-button mb-0.5 size-[28px] rounded-full border border-transparent bg-transparent text-muted-foreground shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 [&_svg]:size-3.5",
                  resetFeedbackPhase === "a" ? "view-rail-button-reset-feedback-a" : null,
                  resetFeedbackPhase === "b" ? "view-rail-button-reset-feedback-b" : null,
                )}
                onClick={handleResetClick}
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Reset view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-pressed={interactionLocked}
                aria-label={
                  interactionLocked ? "Unlock canvas interaction" : "Lock canvas interaction"
                }
                className={cn(
                  "view-rail-button size-[28px] rounded-full border border-transparent bg-transparent shadow-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-out motion-reduce:transition-none [&_svg]:size-3.5",
                  interactionLocked
                    ? "view-rail-button-active"
                    : "text-muted-foreground",
                  lockFeedbackPhase === "a" ? "view-rail-button-lock-feedback-a" : null,
                  lockFeedbackPhase === "b" ? "view-rail-button-lock-feedback-b" : null,
                )}
                onClick={() => onInteractionLockedChange(!interactionLocked)}
              >
                {interactionLocked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {interactionLocked ? "Unlock interaction" : "Lock interaction"}
            </TooltipContent>
          </Tooltip>

          <div className="zoom-slider-shell relative h-[200px] w-7" style={sliderStyle}>
            <input
              ref={zoomSliderRef}
              type="range"
              min={0}
              max={1000}
              step={1}
              value={sliderValue}
              aria-label="Zoom percentage"
              aria-valuetext={`${formatZoomPercent(viewScale)}%`}
              className="zoom-slider absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              data-testid="zoom-slider"
              onChange={(event) => {
                const snappedPosition = snapZoomSliderPosition(Number(event.target.value) / 1000);

                onViewScaleChange(sliderPositionToViewScale(snappedPosition));
                if (isZoomSliderPointerActiveRef.current) {
                  scheduleZoomSliderBlur();
                }
              }}
              onBlur={() => {
                isZoomSliderPointerActiveRef.current = false;
                clearZoomSliderBlurTimeout();
              }}
              onPointerCancel={handleZoomSliderPointerEnd}
              onPointerDown={handleZoomSliderPointerDown}
              onPointerUp={handleZoomSliderPointerEnd}
            />
            <span
              aria-hidden="true"
              className="zoom-slider-track pointer-events-none"
            />
            <span
              aria-hidden="true"
              className="zoom-slider-snap-marker pointer-events-none"
            />
            <span
              aria-hidden="true"
              className="zoom-slider-thumb pointer-events-none"
            />
          </div>
        </div>

        <label className="zoom-percent-control group mt-px flex h-[22px] w-[42px] items-baseline justify-center gap-0 rounded-[8px] border px-1 transition-[background-color,border-color,box-shadow] duration-150">
          <span className="sr-only">Zoom percentage</span>
          <input
            type="text"
            inputMode="decimal"
            value={zoomText}
            aria-label="Zoom percentage input"
            className="zoom-percent-input h-full w-[1.45rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
            data-testid="zoom-input"
            onBlur={commitZoomText}
            onChange={(event) => setZoomText(event.target.value)}
            onKeyDown={handleZoomKeyDown}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground"
          >
            %
          </span>
        </label>
      </aside>
    </TooltipProvider>
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
  interactionMode,
  isOpen,
  onInteractionModeChange,
  onOpenChange,
  onShowBoundaryAtomsChange,
  showBoundaryAtoms,
}: {
  interactionMode: InteractionMode;
  isOpen: boolean;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
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

          <section
            aria-labelledby="interaction-mode-label"
            className={cn("rounded-md border px-3 py-2.5", GLASS_SURFACE_CLASS)}
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="interaction-mode-label"
                className="min-w-0 truncate text-sm font-medium leading-tight"
              >
                Rotation mode
              </h3>
            </div>
            <InteractionModeControl
              disabled={!isOpen}
              interactionMode={interactionMode}
              onInteractionModeChange={onInteractionModeChange}
            />
          </section>
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

function InteractionModeControl({
  disabled,
  interactionMode,
  onInteractionModeChange,
}: {
  disabled: boolean;
  interactionMode: InteractionMode;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rotation interaction mode"
      className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-input bg-background/70 p-1"
    >
      {INTERACTION_MODE_OPTIONS.map((option) => {
        const isSelected = option.value === interactionMode;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={cn(
              "h-8 rounded-md px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              isSelected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            disabled={disabled}
            onClick={() => onInteractionModeChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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
