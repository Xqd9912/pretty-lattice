import type { AtomSpec } from "../api/scene";

export const ATOM_PICK_MAX_DELTA_PX = 4;
const EMPTY_SELECTION_HIGHLIGHT: ReadonlySet<number> = new Set<number>();

export type AtomSelectionAction = "ignore" | "locked" | "toggle";

export interface AtomPointerPosition {
  clientX: number;
  clientY: number;
}

export interface AtomSelectionClick {
  button: number;
  detail: number;
  pointerDown: AtomPointerPosition | null;
  pointerUp: AtomPointerPosition;
}

export function isAtomSelectionClick({
  button,
  detail,
  pointerDown,
  pointerUp,
}: AtomSelectionClick): boolean {
  if (!pointerDown) {
    return false;
  }

  const delta = atomPointerDistance(pointerDown, pointerUp);
  return (
    button === 0 &&
    detail === 1 &&
    Number.isFinite(delta) &&
    delta >= 0 &&
    delta <= ATOM_PICK_MAX_DELTA_PX
  );
}

export function atomPointerDistance(
  pointerDown: AtomPointerPosition,
  pointerUp: AtomPointerPosition,
): number {
  return Math.hypot(
    pointerUp.clientX - pointerDown.clientX,
    pointerUp.clientY - pointerDown.clientY,
  );
}

export function resolveAtomSelectionAction(
  click: AtomSelectionClick,
  interactionLocked: boolean,
): AtomSelectionAction {
  if (!isAtomSelectionClick(click)) {
    return "ignore";
  }
  return interactionLocked ? "locked" : "toggle";
}

export function selectedAtomInstanceIndices(
  atoms: readonly Pick<AtomSpec, "siteIndex">[],
  selectedSiteIndices: ReadonlySet<number>,
): number[] {
  const indices: number[] = [];

  atoms.forEach((atom, index) => {
    if (selectedSiteIndices.has(atom.siteIndex)) {
      indices.push(index);
    }
  });

  return indices;
}

/** A selected-only view already communicates membership by visibility. */
export function selectedSiteIndicesForHighlight(
  selectedSiteIndices: ReadonlySet<number>,
  selectedOnly: boolean,
): ReadonlySet<number> {
  return selectedOnly ? EMPTY_SELECTION_HIGHLIGHT : selectedSiteIndices;
}
