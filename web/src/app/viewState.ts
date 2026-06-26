export type InteractionMode = "trackball" | "orbit";

export interface PreviewViewState {
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  resetCounter: number;
  viewScale: number;
}

export const MIN_VIEW_SCALE = 0.2;
export const MAX_VIEW_SCALE = 5;
export const DEFAULT_VIEW_SCALE = 1;
export const ZOOM_SLIDER_SNAP_POSITION = 0.5;
export const ZOOM_SLIDER_SNAP_THRESHOLD = 0.03;

export const INTERACTION_MODE_OPTIONS: readonly {
  label: string;
  value: InteractionMode;
}[] = [
  { label: "Trackball", value: "trackball" },
  { label: "Orbit", value: "orbit" },
];

export function createPreviewViewState(): PreviewViewState {
  return {
    interactionLocked: false,
    interactionMode: "trackball",
    resetCounter: 0,
    viewScale: DEFAULT_VIEW_SCALE,
  };
}

export function resetPreviewViewState(state: PreviewViewState): PreviewViewState {
  return {
    ...state,
    resetCounter: state.resetCounter + 1,
    viewScale: DEFAULT_VIEW_SCALE,
  };
}

export function setPreviewViewScale(
  state: PreviewViewState,
  viewScale: number,
): PreviewViewState {
  return {
    ...state,
    viewScale: clampViewScale(viewScale),
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

export function setPreviewInteractionLocked(
  state: PreviewViewState,
  interactionLocked: boolean,
): PreviewViewState {
  return {
    ...state,
    interactionLocked,
  };
}

export function clampViewScale(viewScale: number): number {
  if (!Number.isFinite(viewScale)) {
    return 1;
  }

  return Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, viewScale));
}

export function viewScaleToSliderPosition(viewScale: number): number {
  const clampedScale = clampViewScale(viewScale);
  const range = MAX_VIEW_SCALE / MIN_VIEW_SCALE;

  return Math.log(clampedScale / MIN_VIEW_SCALE) / Math.log(range);
}

export function sliderPositionToViewScale(position: number): number {
  const normalizedPosition = Math.min(1, Math.max(0, position));
  const range = MAX_VIEW_SCALE / MIN_VIEW_SCALE;

  return clampViewScale(MIN_VIEW_SCALE * range ** normalizedPosition);
}

export function snapZoomSliderPosition(position: number): number {
  if (Math.abs(position - ZOOM_SLIDER_SNAP_POSITION) <= ZOOM_SLIDER_SNAP_THRESHOLD) {
    return ZOOM_SLIDER_SNAP_POSITION;
  }

  return position;
}

export function formatZoomPercent(viewScale: number): string {
  return String(Math.round(clampViewScale(viewScale) * 100));
}

export function parseZoomPercentInput(value: string): number | null {
  const normalizedValue = value.trim().replace(/%$/, "");
  if (normalizedValue.length === 0) {
    return null;
  }

  const percent = Number(normalizedValue);
  if (!Number.isFinite(percent) || percent <= 0) {
    return null;
  }

  return clampViewScale(percent / 100);
}
