import { CircleAlert } from "lucide-react";
import { Quaternion } from "three";
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DEFAULT_BOND_ALGORITHM,
  uploadStructurePreview,
  type BondAlgorithm,
  type SceneSpec,
} from "../api/scene";
import {
  LatticeScene,
  previewSafeAreaForViewport,
} from "../scene/LatticeScene";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  CommonControlsPanel,
} from "./controls/CommonControlsPanel";
import { ViewControlRail } from "./controls/ViewControlRail";
import { deriveElementLegendEntries } from "./elementLegend";
import { ElementLegend } from "./legend/ElementLegend";
import {
  orientationGizmoContainerStyle,
  orientationGizmoSizeForViewport,
  useViewportSize,
} from "./layout/overlayLayout";
import { StructureSummaryCard } from "./panels/StructureSummaryCard";
import type { PreviewStatus } from "./previewState";
import {
  SettingsDrawer,
  SettingsTrigger,
} from "./settings/SettingsDrawer";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultStyle,
  hasPolyhedra,
  previewSafeAreaForSettings,
  visibleSceneForComponents,
} from "./settings";
import {
  createPreviewViewState,
  resetPreviewViewState,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewViewScale,
  type InteractionMode,
} from "./viewState";

const LOCKED_INTERACTION_DRAG_THRESHOLD_PX = 4;
const LOCKED_INTERACTION_WHEEL_IDLE_MS = 150;
const MAX_STRUCTURE_UPLOAD_BYTES = 10 * 1024 * 1024;
const STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview.";
const STRUCTURE_PARSE_ERROR_MESSAGE = "pymatgen could not parse this file.";

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
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [bondAlgorithm, setBondAlgorithm] =
    useState<BondAlgorithm>(DEFAULT_BOND_ALGORITHM);
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [componentOpacity, setComponentOpacity] = useState(createDefaultComponentOpacity);
  const [style, setStyle] = useState(createDefaultStyle);
  const [viewState, setViewState] = useState(createPreviewViewState);
  const [lockedInteractionFeedbackCount, setLockedInteractionFeedbackCount] = useState(0);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(false);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const leftOverlayRef = useRef<HTMLDivElement>(null);
  const commonControlsPanelRef = useRef<HTMLDivElement>(null);
  const cameraOrientationRef = useRef(new Quaternion());
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

    if (file.size > MAX_STRUCTURE_UPLOAD_BYTES) {
      setSelectedFileName(null);
      setPreviewStatus("error");
      setErrorMessage(STRUCTURE_FILE_TOO_LARGE_MESSAGE);
      setScene(null);
      setCurrentFile(null);
      setIsSettingsOpen(false);
      setIsStructureSummaryCollapsed(false);
      return;
    }

    setSelectedFileName(file.name);
    setPreviewStatus("loading");
    setErrorMessage(null);
    setScene(null);
    setCurrentFile(file);
    setIsSettingsOpen(false);
    setBondAlgorithm(DEFAULT_BOND_ALGORITHM);
    setComponentVisibility(createDefaultComponentVisibility());
    setComponentOpacity(createDefaultComponentOpacity());
    setStyle(createDefaultStyle());
    setViewState(createPreviewViewState());
    setIsStructureSummaryCollapsed(false);

    try {
      const nextScene = await uploadStructurePreview(file);
      setScene(nextScene);
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setPreviewStatus("ready");
    } catch {
      setScene(null);
      setCurrentFile(null);
      setSelectedFileName(null);
      setIsSettingsOpen(false);
      setPreviewStatus("error");
      setErrorMessage(STRUCTURE_PARSE_ERROR_MESSAGE);
    }
  }

  const handleBondAlgorithmChange = useCallback(
    async (nextBondAlgorithm: BondAlgorithm) => {
      setBondAlgorithm(nextBondAlgorithm);
      if (!currentFile) {
        return;
      }

      setPreviewStatus("loading");
      setErrorMessage(null);

      try {
        const nextScene = await uploadStructurePreview(currentFile, {
          bondAlgorithm: nextBondAlgorithm,
        });
        setScene(nextScene);
        setPreviewStatus("ready");
      } catch {
        setScene(null);
        setCurrentFile(null);
        setSelectedFileName(null);
        setIsSettingsOpen(false);
        setPreviewStatus("error");
        setErrorMessage(STRUCTURE_PARSE_ERROR_MESSAGE);
      }
    },
    [currentFile],
  );

  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility),
    [componentVisibility, scene],
  );
  const legendEntries = useMemo(() => deriveElementLegendEntries(scene), [scene]);
  const hasVisibleScene = visibleScene !== null;
  const previewSafeArea = previewSafeAreaForSettings();
  const effectivePreviewSafeArea = useMemo(
    () => previewSafeAreaForViewport(previewSafeArea, viewportSize.width),
    [previewSafeArea, viewportSize.width],
  );
  const orientationGizmoSize = useMemo(
    () => orientationGizmoSizeForViewport(viewportSize, effectivePreviewSafeArea),
    [effectivePreviewSafeArea, viewportSize],
  );
  const triggerLockedInteractionFeedback = useCallback(() => {
    setLockedInteractionFeedbackCount((count) => count + 1);
  }, []);

  const collapseStructureSummaryIfControlsOverflow = useCallback(() => {
    const commonControlsPanelElement = commonControlsPanelRef.current;
    if (!commonControlsPanelElement || isStructureSummaryCollapsed) {
      return;
    }

    const controlsRect = commonControlsPanelElement.getBoundingClientRect();
    const safeBottom = window.innerHeight - 16;
    if (controlsRect.bottom > safeBottom) {
      setIsStructureSummaryCollapsed(true);
    }
  }, [isStructureSummaryCollapsed]);

  const clearLockedInteractionWheelGate = useCallback(() => {
    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    lockedInteractionWheelIdleTimeoutRef.current = null;
  }, []);

  useEffect(() => () => clearLockedInteractionWheelGate(), [clearLockedInteractionWheelGate]);

  useEffect(() => {
    if (!scene || isStructureSummaryCollapsed) {
      return;
    }

    const leftOverlayElement = leftOverlayRef.current;
    const commonControlsPanelElement = commonControlsPanelRef.current;
    if (!leftOverlayElement || !commonControlsPanelElement) {
      return;
    }

    collapseStructureSummaryIfControlsOverflow();
    const animationFrame = window.requestAnimationFrame(collapseStructureSummaryIfControlsOverflow);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", collapseStructureSummaryIfControlsOverflow);
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", collapseStructureSummaryIfControlsOverflow);
      };
    }

    const resizeObserver = new ResizeObserver(collapseStructureSummaryIfControlsOverflow);
    resizeObserver.observe(leftOverlayElement);
    resizeObserver.observe(commonControlsPanelElement);
    window.addEventListener("resize", collapseStructureSummaryIfControlsOverflow);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", collapseStructureSummaryIfControlsOverflow);
    };
  }, [collapseStructureSummaryIfControlsOverflow, isStructureSummaryCollapsed, scene]);

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
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => void handleFileChange(event)}
      />

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
            cameraOrientationRef={cameraOrientationRef}
            interactionLocked={viewState.interactionLocked}
            interactionMode={viewState.interactionMode}
            layoutScene={scene ?? visibleScene}
            onViewScaleChange={handleViewScaleChange}
            resetCounter={viewState.resetCounter}
            safeArea={previewSafeArea}
            scene={visibleScene}
            componentOpacity={componentOpacity}
            style={style}
            showAtoms={componentVisibility.atoms}
            showUnitCell={componentVisibility.unitCell}
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

      {visibleScene ? (
        <OrientationGizmo
          cameraOrientationRef={cameraOrientationRef}
          cellVectors={visibleScene.cell.vectors}
          className="pointer-events-none absolute"
          style={orientationGizmoContainerStyle(effectivePreviewSafeArea, orientationGizmoSize)}
        />
      ) : null}

      {legendEntries.length > 0 ? (
        <ElementLegend
          entries={legendEntries}
          safeArea={previewSafeArea}
        />
      ) : null}

      <div
        ref={leftOverlayRef}
        className={cn(
          "absolute left-4 top-4 flex w-[296px] max-w-[calc(100vw-2rem)] flex-col gap-4",
          isSettingsOpen ? "max-[760px]:hidden" : null,
        )}
      >
        <StructureSummaryCard
          isCollapsed={isStructureSummaryCollapsed}
          onCollapsedChange={setIsStructureSummaryCollapsed}
          onOpenStructure={() => fileInputRef.current?.click()}
          previewStatus={previewStatus}
          scene={scene}
          selectedFileName={selectedFileName}
        />

        {errorMessage ? (
          <Alert
            className="rounded-xl shadow-sm shadow-foreground/5 [&>svg]:text-destructive"
          >
            <CircleAlert aria-hidden="true" />
            <AlertTitle className="font-semibold">Unsupported file</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {scene ? (
          <div ref={commonControlsPanelRef}>
            <CommonControlsPanel
              componentOpacity={componentOpacity}
              style={style}
              componentVisibility={componentVisibility}
              hasPolyhedra={hasPolyhedra(scene)}
              onAtomRadiusModelChange={(atomRadiusModel) => {
                setStyle((currentStyle) => ({ ...currentStyle, atomRadiusModel }));
              }}
              onComponentOpacityChange={setComponentOpacity}
              onStyleChange={setStyle}
              onComponentVisibilityChange={setComponentVisibility}
            />
          </div>
        ) : null}
      </div>

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
            bondAlgorithm={bondAlgorithm}
            interactionMode={viewState.interactionMode}
            isOpen={isSettingsOpen}
            isSceneLoading={previewStatus === "loading"}
            onBondAlgorithmChange={(nextBondAlgorithm) => {
              void handleBondAlgorithmChange(nextBondAlgorithm);
            }}
            onInteractionModeChange={handleInteractionModeChange}
            onOpenChange={setIsSettingsOpen}
          />
        </>
      ) : null}
    </main>
  );
}
