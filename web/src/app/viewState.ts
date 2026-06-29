import {
  applyCrystalCameraRoll,
  createDefaultCrystalCameraState,
  secondaryDirectionForPrimaryChange,
} from "../scene/crystalCamera";
import type {
  CrystalCameraPrimaryDirection,
  CrystalCameraState,
  InteractionMode,
  VectorTuple,
} from "../model";
export {
  BASE_ORBIT_DRAG_SENSITIVITY,
  BASE_TRACKBALL_DRAG_SENSITIVITY,
  DEFAULT_DRAG_SENSITIVITY,
  DEFAULT_VIEW_SCALE,
  DRAG_SENSITIVITY_SLIDER_SNAP_POSITION,
  DRAG_SENSITIVITY_SLIDER_SNAP_THRESHOLD,
  MAX_DRAG_SENSITIVITY,
  INTERACTION_MODE_OPTIONS,
  MAX_VIEW_SCALE,
  MIN_DRAG_SENSITIVITY,
  MIN_VIEW_SCALE,
  ZOOM_SLIDER_SNAP_POSITION,
  ZOOM_SLIDER_SNAP_THRESHOLD,
  clampDragSensitivity,
  clampViewScale,
  dragSensitivityToSliderPosition,
  formatDragSensitivityPercent,
  formatZoomPercent,
  parseDragSensitivityPercentInput,
  parseZoomPercentInput,
  sliderPositionToDragSensitivity,
  sliderPositionToViewScale,
  snapDragSensitivitySliderPosition,
  snapZoomSliderPosition,
  viewScaleToSliderPosition,
  type InteractionMode,
} from "../model/viewState";
import {
  clampDragSensitivity,
  DEFAULT_DRAG_SENSITIVITY,
} from "../model/viewState";

export interface PreviewViewState {
  camera: CrystalCameraState;
  dragSensitivity: number;
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  resetCounter: number;
  showFpsOverlay: boolean;
}

export function createPreviewViewState(cellVectors: VectorTuple[] = []): PreviewViewState {
  return {
    camera: createDefaultCrystalCameraState(cellVectors),
    dragSensitivity: DEFAULT_DRAG_SENSITIVITY,
    interactionLocked: false,
    interactionMode: "trackball",
    resetCounter: 0,
    showFpsOverlay: false,
  };
}

export function resetPreviewViewState(
  state: PreviewViewState,
  cellVectors: VectorTuple[] = [],
): PreviewViewState {
  return {
    ...state,
    camera: createDefaultCrystalCameraState(cellVectors),
    resetCounter: state.resetCounter + 1,
  };
}

export function setPreviewCameraState(
  state: PreviewViewState,
  camera: CrystalCameraState,
): PreviewViewState {
  return {
    ...state,
    camera,
  };
}

export function setPreviewCameraPrimaryDirection(
  state: PreviewViewState,
  primary: CrystalCameraPrimaryDirection,
): PreviewViewState {
  return {
    ...state,
    camera: {
      ...state.camera,
      primary,
      secondary: secondaryDirectionForPrimaryChange(
        state.camera.primary,
        state.camera.secondary,
        primary,
      ),
    },
  };
}

export function setPreviewCameraRoll(
  state: PreviewViewState,
  cellVectors: VectorTuple[],
  rollDegrees: number,
): PreviewViewState {
  return {
    ...state,
    camera: applyCrystalCameraRoll(cellVectors, state.camera, rollDegrees),
  };
}

export function setPreviewInteractionMode(
  state: PreviewViewState,
  interactionMode: InteractionMode,
): PreviewViewState {
  return {
    ...state,
    interactionMode,
  };
}

export function setPreviewDragSensitivity(
  state: PreviewViewState,
  dragSensitivity: number,
): PreviewViewState {
  return {
    ...state,
    dragSensitivity: clampDragSensitivity(dragSensitivity),
  };
}

export function setPreviewInteractionLocked(
  state: PreviewViewState,
  interactionLocked: boolean,
): PreviewViewState {
  return {
    ...state,
    interactionLocked,
  };
}

export function setPreviewShowFpsOverlay(
  state: PreviewViewState,
  showFpsOverlay: boolean,
): PreviewViewState {
  return {
    ...state,
    showFpsOverlay,
  };
}
