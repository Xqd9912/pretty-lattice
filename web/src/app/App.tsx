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
  createDefaultComponentVisibility,
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
  const [viewState, setViewState] = useState(createPreviewViewState);
  const [lockedInteractionFeedbackCount, setLockedInteractionFeedbackCount] = useState(0);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
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

    setSelectedFileName(file.name);
    setPreviewStatus("loading");
    setErrorMessage(null);
    setScene(null);
    setCurrentFile(file);
    setIsSettingsOpen(false);
    setBondAlgorithm(DEFAULT_BOND_ALGORITHM);
    setComponentVisibility(createDefaultComponentVisibility());
    setViewState(createPreviewViewState());

    try {
      const nextScene = await uploadStructurePreview(file);
      setScene(nextScene);
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setPreviewStatus("ready");
    } catch (error) {
      setScene(null);
      setCurrentFile(null);
      setIsSettingsOpen(false);
      setPreviewStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not parse structure.");
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
      } catch (error) {
        setScene(null);
        setCurrentFile(null);
        setIsSettingsOpen(false);
        setPreviewStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Could not parse structure.");
      }
    },
    [currentFile],
  );

  const legendEntries = useMemo(() => deriveElementLegendEntries(scene), [scene]);
  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility),
    [componentVisibility, scene],
  );
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
        <ElementLegend entries={legendEntries} safeArea={previewSafeArea} />
      ) : null}

      <div
        className={cn(
          "absolute left-4 top-4 flex w-[296px] max-w-[calc(100vw-2rem)] flex-col gap-4",
          isSettingsOpen ? "max-[760px]:hidden" : null,
        )}
      >
        <StructureSummaryCard
          errorMessage={errorMessage}
          onOpenStructure={() => fileInputRef.current?.click()}
          previewStatus={previewStatus}
          scene={scene}
          selectedFileName={selectedFileName}
        />

        {scene ? (
          <CommonControlsPanel
            componentVisibility={componentVisibility}
            hasPolyhedra={hasPolyhedra(scene)}
            onComponentVisibilityChange={setComponentVisibility}
          />
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
