export interface PreviewSafeArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export const INSPECTOR_PREVIEW_SAFE_AREA: PreviewSafeArea = {
  bottom: 116,
  left: 420,
  right: 176,
  top: 40,
};
export const INSPECTOR_OPEN_SCENE_OFFSET_X_PX = -122;
export const INSPECTOR_SCENE_OFFSET_BREAKPOINT_PX = 760;
// The structure-analysis panel is a resizable left-hand column.
export const ANALYSIS_PANEL_DEFAULT_WIDTH_PX = 440;
export const ANALYSIS_PANEL_MIN_WIDTH_PX = 360;
// The structure inspector is a resizable right-hand column.
export const INSPECTOR_PANEL_DEFAULT_WIDTH_PX = 360;
export const INSPECTOR_PANEL_MIN_WIDTH_PX = 300;
// The electronic panel is a second, resizable right-hand column.
export const ELECTRONIC_PANEL_DEFAULT_WIDTH_PX = 460;
export const ELECTRONIC_PANEL_MIN_WIDTH_PX = 360;
// Keep the structure centered in the viewport area left of the right-hand
// panels: shifting the scene left by half the panels' combined width holds the
// structure's centre as the anchor while its on-screen size never changes.
const RIGHT_PANEL_SCENE_OFFSET_FACTOR = 0.5;

export function previewSafeAreaForInspector(): PreviewSafeArea {
  return INSPECTOR_PREVIEW_SAFE_AREA;
}

/**
 * Leftward scene shift that keeps the structure centered in the space left of
 * the open right-hand panels (structure inspector + electronic panel). Callers
 * pass each panel's width, or 0 when it is closed. Pure translation, so the
 * structure keeps its on-screen size (its centre is the fixed anchor) while the
 * empty background compresses as a panel widens.
 */
export function rightPanelsSceneOffsetX(
  inspectorPanelWidth: number,
  electronicPanelWidth: number,
  viewportWidth: number,
): number {
  if (viewportWidth <= INSPECTOR_SCENE_OFFSET_BREAKPOINT_PX) {
    return 0;
  }
  const occupied = Math.max(0, inspectorPanelWidth) + Math.max(0, electronicPanelWidth);
  if (occupied <= 0) {
    return 0;
  }
  return -Math.round(occupied * RIGHT_PANEL_SCENE_OFFSET_FACTOR);
}

/**
 * The electronic panel sits to the left of the inspector column, so its right
 * edge is offset by the (open) inspector width — 0 when the inspector is closed.
 */
export function electronicPanelRightOffset(inspectorPanelWidth: number): number {
  return Math.max(0, inspectorPanelWidth);
}
