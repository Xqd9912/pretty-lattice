import { AlertTriangleIcon, FolderOpen, ImageDown, RefreshCw, RotateCcw, Zap } from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AtomInspectorCard } from "./AtomInspectorCard";
import type { SceneSpec } from "../api/scene";
import type { IsosurfaceOverlay } from "../scene/DensityIsosurface";
import { TOOL_ICON_BUTTON_ACTIVE_CLASS, TOOL_ICON_BUTTON_CLASS } from "./surface";
import { inspectedAtomInfoForId } from "./atomInspector";
import {
  LatticeScene,
  previewSafeAreaForViewport,
} from "../scene/LatticeScene";
import { ATOM_HIGHLIGHT_PULSE_MS } from "../scene/atomHighlight";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  CommonControlsPanel,
  type CommonPanelTab,
} from "./controls/CommonControlsPanel";
import { ViewControlRail } from "./controls/ViewControlRail";
import { createCameraInteractionStore } from "./cameraInteractionStore";
import { createPreviewFpsStore } from "../model/previewFpsStore";
import { deriveElementLegendEntries } from "./elementLegend";
import { useFigureExportController } from "./hooks/useFigureExportController";
import { useLockedInteractionFeedback } from "./hooks/useLockedInteractionFeedback";
import { usePreviewCameraCommands } from "./hooks/usePreviewCameraCommands";
import { useStructurePreview } from "./hooks/useStructurePreview";
import { useTrajectory } from "./hooks/useTrajectory";
import { isTrajectoryFileName } from "../api/trajectory";
import { bondCutoffPairsFromScene, updateBondCutoff } from "../model/bondCutoffs";
import { TrajectoryPlayer } from "./trajectory/TrajectoryPlayer";
import { AnalysisPanel } from "./analysis/AnalysisPanel";
import { ElectronicPanel } from "./electronic/ElectronicPanel";
import { ElementLegend } from "./legend/ElementLegend";
import {
  orientationGizmoContainerStyle,
  orientationGizmoSizeForViewport,
  useViewportSize,
} from "./layout/overlayLayout";
import { StructureSummaryCard } from "./panels/StructureSummaryCard";
import {
  InspectorSidebar,
  InspectorToggle,
} from "./inspector/InspectorSidebar";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultStyle,
  baseColorSchemeForStyle,
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  createCustomColormapFromScheme,
  defaultPreviewMeshQualityForScene,
  elementColorOverridesForStyle,
  type MeshQuality,
  type UnitCellLineStyle,
  hasPolyhedra,
  previewSafeAreaForInspector,
  rightPanelsSceneOffsetX,
  electronicPanelRightOffset,
  ANALYSIS_PANEL_DEFAULT_WIDTH_PX,
  ELECTRONIC_PANEL_DEFAULT_WIDTH_PX,
  INSPECTOR_PANEL_DEFAULT_WIDTH_PX,
  visibleSceneForComponents,
} from "../model";

interface ResetLoadedPreviewOptions {
  preserveActiveCommonPanelTab?: boolean;
  preserveInspectorOpen?: boolean;
}

type ResetLoadedPreviewState = (
  nextScene: SceneSpec | null,
  options?: ResetLoadedPreviewOptions,
) => void;

export function App() {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [componentOpacity, setComponentOpacity] = useState(createDefaultComponentOpacity);
  const [style, setStyle] = useState(createDefaultStyle);
  const [previewMeshQuality, setPreviewMeshQuality] = useState<MeshQuality>(
    () => defaultPreviewMeshQualityForScene(null),
  );
  const [unitCellLineStyle, setUnitCellLineStyle] = useState<UnitCellLineStyle>(
    DEFAULT_UNIT_CELL_LINE_STYLE,
  );
  const [showCrystalAxisLabels, setShowCrystalAxisLabels] = useState(
    DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  );
  const [inspectedAtomId, setInspectedAtomId] = useState<string | null>(null);
  const [pulseAtom, setPulseAtom] = useState<{ atomId: string; token: number } | null>(null);
  const [activeCommonPanelTab, setActiveCommonPanelTab] =
    useState<CommonPanelTab>("display");
  const [cameraInteractionStore] = useState(createCameraInteractionStore);
  const [previewFpsStore] = useState(createPreviewFpsStore);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(true);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inspectedAtomIdRef = useRef<string | null>(null);
  const resetLoadedPreviewStateRef = useRef<ResetLoadedPreviewState>(() => {});
  const resetLoadedPreviewStateForPreview = useCallback<ResetLoadedPreviewState>(
    (nextScene, options) => {
      resetLoadedPreviewStateRef.current(nextScene, options);
    },
    [],
  );
  const handlePreviewCleared = useCallback(() => {
    setInspectedAtomId(null);
    setPulseAtom(null);
    setIsInspectorOpen(false);
    setIsStructureSummaryCollapsed(true);
  }, []);
  const handleBondAlgorithmSceneLoaded = useCallback((nextScene: SceneSpec) => {
    setInspectedAtomId(null);
    setPulseAtom(null);
    setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
    setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
    setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
  }, []);
  const {
    bondAlgorithm,
    bondCutoffs,
    errorMessage: structureErrorMessage,
    errorTitle: structureErrorTitle,
    handleBondAlgorithmChange,
    handleBondCutoffChange,
    handleResetAllSettings,
    loadStructureFile,
    previewStatus: structurePreviewStatus,
    scene: structureScene,
    selectedFileName,
    setBondAlgorithm,
    setBondCutoffs,
    setErrorMessage,
  } = useStructurePreview({
    onBondAlgorithmSceneLoaded: handleBondAlgorithmSceneLoaded,
    onPreviewCleared: handlePreviewCleared,
    resetLoadedPreviewState: resetLoadedPreviewStateForPreview,
  });

  const [trajectoryFileName, setTrajectoryFileName] = useState<string | null>(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isElectronicOpen, setIsElectronicOpen] = useState(false);
  const [electronicPanelWidth, setElectronicPanelWidth] = useState(
    ELECTRONIC_PANEL_DEFAULT_WIDTH_PX,
  );
  const [inspectorPanelWidth, setInspectorPanelWidth] = useState(
    INSPECTOR_PANEL_DEFAULT_WIDTH_PX,
  );
  const [analysisPanelWidth, setAnalysisPanelWidth] = useState(
    ANALYSIS_PANEL_DEFAULT_WIDTH_PX,
  );
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const [densityScene, setDensityScene] = useState<SceneSpec | null>(null);
  const [densityFileName, setDensityFileName] = useState<string | null>(null);
  const [densityIsosurface, setDensityIsosurface] = useState<IsosurfaceOverlay | null>(null);
  const handleFrameSceneLoaded = useCallback(() => {}, []);
  const handleTrajectoryLoaded = useCallback(
    (nextScene: SceneSpec) => {
      resetLoadedPreviewStateForPreview(nextScene);
      // Seed the per-pair cutoff editor from the covalent-radii defaults the
      // first frame reports. Bonding is already on "custom-cutoff" (set before
      // loading) because it rebuilds ~60x faster per frame than CrystalNN, so
      // playback keeps up, and matches the "one cutoff for all frames" workflow.
      setBondCutoffs(bondCutoffPairsFromScene(nextScene));
    },
    [resetLoadedPreviewStateForPreview, setBondCutoffs],
  );
  const handleElementsRemapped = useCallback(
    (nextScene: SceneSpec) => {
      // Atom types were remapped to new elements; re-seed the per-pair cutoffs
      // (and thus the legend/editor) from the new frame's covalent defaults.
      setBondCutoffs(bondCutoffPairsFromScene(nextScene));
    },
    [setBondCutoffs],
  );
  const trajectory = useTrajectory({
    bondAlgorithm,
    bondCutoffs,
    onFrameSceneLoaded: handleFrameSceneLoaded,
    onTrajectoryLoaded: handleTrajectoryLoaded,
    onElementsRemapped: handleElementsRemapped,
  });

  const handleDensitySceneChange = useCallback(
    (next: { scene: SceneSpec; fileName: string } | null) => {
      if (next) {
        setDensityScene(next.scene);
        setDensityFileName(next.fileName);
        resetLoadedPreviewStateForPreview(next.scene);
      } else {
        setDensityScene(null);
        setDensityFileName(null);
        setDensityIsosurface(null);
      }
    },
    [resetLoadedPreviewStateForPreview],
  );
  const handleIsosurfaceChange = useCallback((overlay: IsosurfaceOverlay | null) => {
    setDensityIsosurface(overlay);
  }, []);

  const trajectoryActive = trajectory.isActive;
  // A loaded CHGCAR density (structure + electron-cloud isosurface) takes over
  // the main viewport, reusing the structure renderer.
  const densityActive = densityScene !== null;
  const scene = densityActive
    ? densityScene
    : trajectoryActive
      ? trajectory.frameScene
      : structureScene;
  // A trajectory reports "loading" from the moment upload starts, but it only becomes
  // "active" once its metadata arrives. Parsing a large trajectory is the slowest step, so
  // surface that loading state during the gap too — otherwise the preview shows nothing
  // happening while the file is being read.
  const trajectoryLoading = trajectory.status === "loading";
  const previewStatus = densityActive
    ? "ready"
    : trajectoryActive
      ? trajectory.status
      : trajectoryLoading
        ? "loading"
        : structurePreviewStatus;
  const loadingLabel = trajectoryLoading ? "Loading trajectory…" : "Loading structure…";
  const errorMessage = trajectoryActive
    ? trajectory.error
    : structureErrorMessage;
  const errorTitle =
    trajectoryActive && trajectory.error ? "Unsupported file" : structureErrorTitle;
  const displayFileName = densityActive
    ? densityFileName
    : trajectoryActive
      ? trajectoryFileName
      : selectedFileName;

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      // Opening a structure/trajectory dismisses any active CHGCAR density view
      // and closes the electronic panel so it does not linger over the new file.
      handleDensitySceneChange(null);
      setIsElectronicOpen(false);
      if (isTrajectoryFileName(file.name)) {
        setTrajectoryFileName(file.name);
        // Switch to fast cutoff bonding before loading so frame 0 (and every
        // frame) is built with the ~60x faster custom-cutoff path rather than
        // CrystalNN; cutoffs are seeded from the first frame's defaults.
        setBondAlgorithm("custom-cutoff");
        setBondCutoffs([]);
        await trajectory.loadTrajectory(file);
      } else {
        trajectory.clearTrajectory();
        setTrajectoryFileName(null);
        await loadStructureFile(file);
      }
    },
    [
      handleDensitySceneChange,
      loadStructureFile,
      setBondAlgorithm,
      setBondCutoffs,
      setIsElectronicOpen,
      trajectory,
    ],
  );

  const handleUnifiedBondAlgorithmChange = useCallback(
    (nextBondAlgorithm: typeof bondAlgorithm) => {
      if (trajectoryActive) {
        setBondAlgorithm(nextBondAlgorithm);
      } else {
        void handleBondAlgorithmChange(nextBondAlgorithm);
      }
    },
    [handleBondAlgorithmChange, setBondAlgorithm, trajectoryActive],
  );

  const handleUnifiedBondCutoffChange = useCallback(
    (key: string, distance: number) => {
      if (trajectoryActive) {
        setBondCutoffs((previous) => updateBondCutoff(previous, key, distance));
      } else {
        handleBondCutoffChange(key, distance);
      }
    },
    [handleBondCutoffChange, setBondCutoffs, trajectoryActive],
  );

  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility),
    [componentVisibility, scene],
  );
  const inspectedAtomInfo = useMemo(
    () => inspectedAtomInfoForId(visibleScene, inspectedAtomId),
    [inspectedAtomId, visibleScene],
  );
  const hasVisibleScene = visibleScene !== null;
  const {
    cameraAnimatedCommandVersion,
    cameraCommandVersion,
    cameraControlsPanelState,
    cameraOrientationRef,
    cameraOrientationVersion,
    handleCameraCommandAnimationActiveChange,
    handleCameraControlsInteractionActiveChange,
    handleCameraOrientationChange,
    handleCameraPrimaryChange,
    handleCameraRollChange,
    handleCameraRollPreviewChange,
    handleCameraRollPreviewStart,
    handleCameraSecondaryChange,
    handleCameraStateChange,
    handleDragSensitivityChange,
    handleGizmoAxisClick,
    handleInteractionLockedChange,
    handleInteractionModeChange,
    handleLightStrengthChange,
    handleResetView,
    handleShowFpsOverlayChange,
    isCameraCommandAnimationActive,
    isCameraControlsInteractionActive,
    isCameraRollInteractionActive,
    orientationGizmoFrameRequestRef,
    requestOrientationGizmoFrame,
    resetCameraForScene,
    viewState,
  } = usePreviewCameraCommands({
    cameraInteractionStore,
    previewFpsStore,
    scene,
    visibleScene,
  });
  const {
    exportError,
    exportProjectedSize,
    exportSettings,
    handleExportFigure,
    handleExportSettingsChange,
    isExporting,
    resetExportState,
    setExportError,
    syncProjectedSizeForExportTab,
  } = useFigureExportController({
    cameraOrientationRef,
    componentOpacity,
    componentVisibility,
    lightStrength: viewState.lightStrength,
    scene,
    selectedFileName: displayFileName,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
    visibleScene,
  });
  const {
    handleSceneContextMenuCapture,
    handleScenePointerDownCapture,
    handleScenePointerEndCapture,
    handleScenePointerMoveCapture,
    handleSceneWheelCapture,
    lockedInteractionFeedbackCount,
    resetLockedInteractionFeedback,
    triggerLockedInteractionFeedback,
  } = useLockedInteractionFeedback({
    hasVisibleScene,
    interactionLocked: viewState.interactionLocked,
  });

  useEffect(() => {
    inspectedAtomIdRef.current = inspectedAtomId;
  }, [inspectedAtomId]);

  useEffect(() => {
    if (!pulseAtom) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPulseAtom((currentPulseAtom) =>
        currentPulseAtom?.token === pulseAtom.token ? null : currentPulseAtom,
      );
    }, ATOM_HIGHLIGHT_PULSE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [pulseAtom]);

  const resetLoadedPreviewState = useCallback(
    (
      nextScene: SceneSpec | null,
      options: ResetLoadedPreviewOptions = {},
    ) => {
      setErrorMessage(null);
      resetExportState();
      setInspectedAtomId(null);
      setPulseAtom(null);
      if (!options.preserveInspectorOpen) {
        setIsInspectorOpen(false);
      }
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setComponentOpacity(createDefaultComponentOpacity());
      setStyle(createDefaultStyle());
      setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
      setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
      setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
      if (!options.preserveActiveCommonPanelTab) {
        setActiveCommonPanelTab("display");
      }
      resetLockedInteractionFeedback();
      setIsStructureSummaryCollapsed(true);
      resetCameraForScene(nextScene);
    },
    [
      resetCameraForScene,
      resetExportState,
      resetLockedInteractionFeedback,
    ],
  );

  useLayoutEffect(() => {
    resetLoadedPreviewStateRef.current = resetLoadedPreviewState;
  }, [resetLoadedPreviewState]);

  const handlePreviewMeshQualityChange = useCallback((nextQuality: MeshQuality) => {
    setPreviewMeshQuality(nextQuality);
  }, []);

  const handleFogAffectsUnitCellChange = useCallback((fogAffectsUnitCell: boolean) => {
    setStyle((currentStyle) => ({
      ...currentStyle,
      fogAffectsUnitCell,
    }));
  }, []);
  const handleDistinguishSimilarColorsChange = useCallback((distinguishSimilarColors: boolean) => {
    setStyle((currentStyle) => ({
      ...currentStyle,
      distinguishSimilarColors,
    }));
  }, []);

  const handleAtomPulse = useCallback((atomId: string) => {
    if (atomId === inspectedAtomIdRef.current) {
      return;
    }

    inspectedAtomIdRef.current = null;
    setInspectedAtomId(null);
    setPulseAtom((currentPulseAtom) => ({
      atomId,
      token: (currentPulseAtom?.token ?? 0) + 1,
    }));
  }, []);

  const handleAtomInspect = useCallback((atomId: string | null) => {
    inspectedAtomIdRef.current = atomId;
    setInspectedAtomId(atomId);
  }, []);

  const elementColorOverrides = useMemo(
    () =>
      scene
        ? elementColorOverridesForStyle(scene.atoms, style)
        : undefined,
    [scene, style],
  );
  const legendColorScheme = baseColorSchemeForStyle(style);
  const legendEntries = useMemo(
    () => deriveElementLegendEntries(scene, legendColorScheme, elementColorOverrides),
    [elementColorOverrides, legendColorScheme, scene],
  );
  const handleLegendElementColorChange = useCallback((element: string, color: string) => {
    setStyle((currentStyle) => {
      const draft =
        currentStyle.colorSchemeMode === "custom" && currentStyle.customColormap
          ? currentStyle.customColormap
          : createCustomColormapFromScheme(currentStyle.colorScheme);

      return {
        ...currentStyle,
        colorSchemeMode: "custom",
        colorScheme: draft.baseColorScheme,
        customColormap: {
          baseColorScheme: draft.baseColorScheme,
          elements: {
            ...draft.elements,
            [element]: color,
          },
        },
      };
    });
  }, []);
  const previewSafeArea = previewSafeAreaForInspector();
  const inspectorOpenWidth = isInspectorOpen && scene !== null ? inspectorPanelWidth : 0;
  const sceneOffsetX = rightPanelsSceneOffsetX(
    inspectorOpenWidth,
    isElectronicOpen ? electronicPanelWidth : 0,
    viewportSize.width,
  );
  const effectivePreviewSafeArea = useMemo(
    () => previewSafeAreaForViewport(previewSafeArea, viewportSize.width),
    [previewSafeArea, viewportSize.width],
  );
  const orientationGizmoSize = useMemo(
    () => orientationGizmoSizeForViewport(viewportSize, effectivePreviewSafeArea),
    [effectivePreviewSafeArea, viewportSize],
  );
  const renderPreviewContextMenuContent = () => (
    <ContextMenuContent className="w-36">
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!scene || previewStatus === "loading"}
          onSelect={handleResetView}
        >
          <RotateCcw aria-hidden="true" />
          Reset view
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onSelect={() => fileInputRef.current?.click()}>
          <FolderOpen aria-hidden="true" />
          Open file
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!scene || isExporting || previewStatus === "loading"}
          onSelect={() => {
            void handleExportFigure();
          }}
        >
          <ImageDown aria-hidden="true" />
          Export figure
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!scene || previewStatus === "loading"}
          onSelect={() => {
            void handleResetAllSettings();
          }}
        >
          <RefreshCw aria-hidden="true" />
          Reset all
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  useEffect(() => {
    if (!inspectedAtomId) {
      return;
    }

    if (!visibleScene || !componentVisibility.atoms || !inspectedAtomInfo) {
      setInspectedAtomId(null);
    }
  }, [componentVisibility.atoms, inspectedAtomId, inspectedAtomInfo, visibleScene]);

  useEffect(() => {
    if (activeCommonPanelTab !== "export") {
      return;
    }

    syncProjectedSizeForExportTab();
  }, [activeCommonPanelTab, cameraOrientationVersion, syncProjectedSizeForExportTab]);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Structure file"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => void handleFileChange(event)}
      />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <section
            className={cn(
              "scene-stage absolute inset-0",
              !isResizingRightPanel &&
                "transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            )}
            style={{ transform: `translateX(${sceneOffsetX}px)` }}
            aria-label="Crystal structure preview"
            onPointerCancelCapture={handleScenePointerEndCapture}
            onContextMenuCapture={handleSceneContextMenuCapture}
            onPointerDownCapture={handleScenePointerDownCapture}
            onPointerMoveCapture={handleScenePointerMoveCapture}
            onPointerUpCapture={handleScenePointerEndCapture}
            onWheelCapture={handleSceneWheelCapture}
          >
            {visibleScene ? (
              <LatticeScene
                cameraAnimatedCommandVersion={cameraAnimatedCommandVersion}
                cameraCommandVersion={cameraCommandVersion}
                cameraState={viewState.camera}
                cameraOrientationRef={cameraOrientationRef}
                onCameraOrientationFrame={requestOrientationGizmoFrame}
                onCameraOrientationChange={handleCameraOrientationChange}
                onCameraCommandAnimationActiveChange={handleCameraCommandAnimationActiveChange}
                onCameraControlsInteractionActiveChange={
                  handleCameraControlsInteractionActiveChange
                }
                onAtomInspect={handleAtomInspect}
                onAtomPulse={handleAtomPulse}
                onLockedInteractionAttempt={triggerLockedInteractionFeedback}
                cameraInteractionStore={cameraInteractionStore}
                suspendCameraOrientationUpdates={
                  isCameraCommandAnimationActive ||
                  isCameraControlsInteractionActive ||
                  isCameraRollInteractionActive
                }
                interactionLocked={viewState.interactionLocked}
                interactionMode={viewState.interactionMode}
                isosurface={densityActive ? densityIsosurface : null}
                layoutScene={scene ?? visibleScene}
                resetCounter={viewState.resetCounter}
                safeArea={previewSafeArea}
                scene={visibleScene}
                inspectedAtomId={inspectedAtomId}
                pulseAtomId={pulseAtom?.atomId ?? null}
                pulseToken={pulseAtom?.token ?? 0}
                previewMeshQuality={previewMeshQuality}
                componentOpacity={componentOpacity}
                dragSensitivity={viewState.dragSensitivity}
                lightStrength={viewState.lightStrength}
                previewFpsStore={previewFpsStore}
                style={style}
                showAtoms={componentVisibility.atoms}
                showFpsOverlay={viewState.showFpsOverlay}
                showUnitCell={componentVisibility.unitCell}
                unitCellLineStyle={unitCellLineStyle}
              />
            ) : (
              <div
                className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground"
                data-state={previewStatus}
              >
                {previewStatus === "loading" ? null : "No structure loaded"}
              </div>
            )}
            {previewStatus === "loading" ? (
              // Sits above the canvas so the loading state is visible while a large file is
              // parsed, even when an earlier scene is still on screen (e.g. loading a new
              // trajectory over the current one).
              <div
                className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-background/70 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
                data-testid="preview-loading-overlay"
                data-state={previewStatus}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3.5 py-1.5 text-sm text-muted-foreground shadow-sm">
                  <span
                    aria-hidden="true"
                    data-testid="loading-structure-spinner"
                    className="inline-flex size-3 shrink-0 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-safe:animate-spin motion-safe:[animation-duration:450ms]"
                  />
                  {loadingLabel}
                </span>
              </div>
            ) : null}
          </section>
        </ContextMenuTrigger>
        {renderPreviewContextMenuContent()}
      </ContextMenu>

      {visibleScene ? (
        <OrientationGizmo
          cameraOrientationRef={cameraOrientationRef}
          cellVectors={visibleScene.cell.vectors}
          className="absolute"
          frameRequestRef={orientationGizmoFrameRequestRef}
          onAxisClick={handleGizmoAxisClick}
          orientationVersion={cameraOrientationVersion}
          showLabels={showCrystalAxisLabels}
          style={orientationGizmoContainerStyle(effectivePreviewSafeArea, orientationGizmoSize)}
        />
      ) : null}

      {trajectory.meta ? (
        <TrajectoryPlayer
          disabled={previewStatus === "loading" && !trajectory.frameScene}
          frameIndex={trajectory.frameIndex}
          isPlaying={trajectory.isPlaying}
          meta={trajectory.meta}
          onApplyTypeMap={(typeMap) => void trajectory.applyTypeMap(typeMap)}
          onFpsChange={trajectory.setPlaybackFps}
          onFrameChange={trajectory.goToFrame}
          onOpenAnalysis={() => setIsAnalysisOpen(true)}
          onTogglePlay={trajectory.togglePlay}
          playbackFps={trajectory.playbackFps}
        />
      ) : null}

      <AnalysisPanel
        isOpen={isAnalysisOpen && trajectoryActive}
        onClose={() => setIsAnalysisOpen(false)}
        trajectoryId={trajectory.meta?.trajectoryId ?? null}
        symbols={trajectory.meta?.elements ?? []}
        frameCount={trajectory.meta?.frameCount ?? 0}
        width={analysisPanelWidth}
        onWidthChange={setAnalysisPanelWidth}
        onResizeActiveChange={setIsResizingRightPanel}
      />

      {/* Electronic-properties toggle: an independent icon button stacked below
          the inspector toggle (or at the corner when no structure is loaded). */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Electronic properties"
        aria-pressed={isElectronicOpen}
        title="Electronic properties"
        className={cn(
          TOOL_ICON_BUTTON_CLASS,
          "absolute right-4 z-40 size-8 rounded-[10px] [&_svg]:size-4",
          scene ? "top-[3.25rem]" : "top-4",
          isElectronicOpen
            ? TOOL_ICON_BUTTON_ACTIVE_CLASS
            : "border-foreground/10 bg-card/80 backdrop-blur-xl backdrop-saturate-150",
        )}
        onClick={() => setIsElectronicOpen((open) => !open)}
      >
        <Zap aria-hidden="true" />
      </Button>

      <ElectronicPanel
        isOpen={isElectronicOpen}
        width={electronicPanelWidth}
        onWidthChange={setElectronicPanelWidth}
        onResizeActiveChange={setIsResizingRightPanel}
        rightOffset={electronicPanelRightOffset(inspectorOpenWidth)}
        onDensitySceneChange={handleDensitySceneChange}
        onIsosurfaceChange={handleIsosurfaceChange}
      />

      {legendEntries.length > 0 ? (
        <ElementLegend
          entries={legendEntries}
          offsetX={sceneOffsetX}
          onElementColorChange={handleLegendElementColorChange}
          safeArea={previewSafeArea}
          bottomPx={trajectory.meta ? 124 : 28}
        />
      ) : null}

      {inspectedAtomInfo ? (
        <AtomInspectorCard
          colorScheme={legendColorScheme}
          colorOverrides={elementColorOverrides}
          info={inspectedAtomInfo}
          isInspectorOpen={isInspectorOpen}
          onClose={() => setInspectedAtomId(null)}
        />
      ) : null}

      <div
        className={cn(
          "absolute left-4 top-4 flex w-[296px] max-w-[calc(100vw-2rem)] flex-col gap-4",
          isInspectorOpen ? "max-[760px]:hidden" : null,
        )}
      >
        <StructureSummaryCard
          isCollapsed={isStructureSummaryCollapsed}
          onCollapsedChange={setIsStructureSummaryCollapsed}
          onOpenStructure={() => fileInputRef.current?.click()}
          previewStatus={previewStatus}
          scene={scene}
          selectedFileName={displayFileName}
        />

        {scene ? (
          <div>
            <CommonControlsPanel
              activeTab={activeCommonPanelTab}
              cameraState={cameraControlsPanelState}
              cellVectors={scene.cell.vectors}
              componentOpacity={componentOpacity}
              style={style}
              exportProjectedSize={exportProjectedSize ?? undefined}
              componentVisibility={componentVisibility}
              exportError={exportError}
              exportSettings={exportSettings}
              hasPolyhedra={hasPolyhedra(scene)}
              isExporting={isExporting}
              onActiveTabChange={setActiveCommonPanelTab}
              onAtomRadiusModelChange={(atomRadiusModel) => {
                setStyle((currentStyle) => ({ ...currentStyle, atomRadiusModel }));
              }}
              onCameraPrimaryChange={handleCameraPrimaryChange}
              onCameraRollPreviewChange={handleCameraRollPreviewChange}
              onCameraRollPreviewStart={handleCameraRollPreviewStart}
              onCameraRollChange={handleCameraRollChange}
              onCameraSecondaryChange={handleCameraSecondaryChange}
              onCameraStateChange={handleCameraStateChange}
              onComponentOpacityChange={setComponentOpacity}
              onExport={handleExportFigure}
              onExportSettingsChange={handleExportSettingsChange}
              onStyleChange={setStyle}
              onComponentVisibilityChange={setComponentVisibility}
            />
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <Alert
          className={cn(
            "absolute top-4 z-20 w-[320px] rounded-xl shadow-sm shadow-foreground/5",
            scene ? "left-[386px]" : "left-[328px]",
            "max-[760px]:left-4 max-[760px]:right-4 max-[760px]:top-[10rem] max-[760px]:w-auto",
          )}
          onDismiss={() => setErrorMessage(null)}
        >
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle className="font-semibold">{errorTitle}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {scene ? (
        <>
          <ViewControlRail
            className={cn(isInspectorOpen ? "max-[760px]:hidden" : null)}
            interactionLocked={viewState.interactionLocked}
            lockedInteractionFeedbackCount={lockedInteractionFeedbackCount}
            onInteractionLockedChange={handleInteractionLockedChange}
            onResetView={handleResetView}
            cameraInteractionStore={cameraInteractionStore}
            previewFpsStore={previewFpsStore}
            showFps={viewState.showFpsOverlay}
          />

          <InspectorToggle
            isOpen={isInspectorOpen}
            onOpenChange={setIsInspectorOpen}
          />

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="contents">
                <InspectorSidebar
                  bondAlgorithm={bondAlgorithm}
                  bondCutoffs={bondCutoffs}
                  dragSensitivity={viewState.dragSensitivity}
                  interactionMode={viewState.interactionMode}
                  lightStrength={viewState.lightStrength}
                  isCustomColorScheme={style.colorSchemeMode === "custom"}
                  isOpen={isInspectorOpen}
                  isSceneLoading={previewStatus === "loading"}
                  width={inspectorPanelWidth}
                  onWidthChange={setInspectorPanelWidth}
                  onResizeActiveChange={setIsResizingRightPanel}
                  previewMeshQuality={previewMeshQuality}
                  fogAffectsUnitCell={style.fogAffectsUnitCell}
                  distinguishSimilarColors={style.distinguishSimilarColors}
                  showFpsOverlay={viewState.showFpsOverlay}
                  showCrystalAxisLabels={showCrystalAxisLabels}
                  unitCellLineStyle={unitCellLineStyle}
                  onBondAlgorithmChange={handleUnifiedBondAlgorithmChange}
                  onBondCutoffChange={handleUnifiedBondCutoffChange}
                  onDragSensitivityChange={handleDragSensitivityChange}
                  onInteractionModeChange={handleInteractionModeChange}
                  onLightStrengthChange={handleLightStrengthChange}
                  onPreviewMeshQualityChange={handlePreviewMeshQualityChange}
                  onFogAffectsUnitCellChange={handleFogAffectsUnitCellChange}
                  onDistinguishSimilarColorsChange={handleDistinguishSimilarColorsChange}
                  onShowFpsOverlayChange={handleShowFpsOverlayChange}
                  onShowCrystalAxisLabelsChange={setShowCrystalAxisLabels}
                  onUnitCellLineStyleChange={setUnitCellLineStyle}
                />
              </div>
            </ContextMenuTrigger>
            {renderPreviewContextMenuContent()}
          </ContextMenu>
        </>
      ) : null}
    </main>
  );
}
