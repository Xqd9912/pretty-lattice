import { Color } from "three";

export const ATOM_HIGHLIGHT_TARGET_COLOR = new Color("#ffffff");
export const ATOM_HIGHLIGHT_PULSE_MS = 240;
export const ATOM_HIGHLIGHT_SELECT_MS = 150;
export const ATOM_HIGHLIGHT_SELECTED_COLOR_MIX = 0.26;
export const ATOM_HIGHLIGHT_PULSE_COLOR_MIX = 0.34;
export const ATOM_SELECTION_RING_WORLD_SCALE = 2.55;
export const ATOM_SELECTION_RING_SELECTED_SCALE = 1;
export const ATOM_SELECTION_RING_PULSE_MIN_SCALE = 0.9;
export const ATOM_SELECTION_RING_SELECTED_OPACITY = 1;

export function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function atomPulseFade(progress: number): number {
  const fadeIn = Math.min(1, progress / 0.28);
  const fadeOut = progress < 0.28 ? 1 : 1 - (progress - 0.28) / 0.72;
  return fadeIn * Math.max(0, fadeOut) ** 0.72;
}
