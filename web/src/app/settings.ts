import type { AtomSpec, BondSpec, SceneSpec, VisibilityDependency } from "../api/scene";
import type { PreviewSafeArea } from "../scene/LatticeScene";

export const SETTINGS_PREVIEW_SAFE_AREA: PreviewSafeArea = {
  bottom: 132,
  left: 420,
  right: 176,
  top: 24,
};

export interface ComponentVisibilityState {
  atoms: boolean;
  unitCell: boolean;
  bonds: boolean;
  boundaryAtoms: boolean;
  oneHopBondedAtoms: boolean;
}

export const DEFAULT_COMPONENT_VISIBILITY: ComponentVisibilityState = {
  atoms: true,
  unitCell: true,
  bonds: true,
  boundaryAtoms: true,
  oneHopBondedAtoms: true,
};

export function createDefaultComponentVisibility(): ComponentVisibilityState {
  return { ...DEFAULT_COMPONENT_VISIBILITY };
}

export function countPeriodicImageAtoms(scene: SceneSpec | null): number {
  if (!scene) {
    return 0;
  }

  return scene.atoms.filter((atom) => atom.isPeriodicImage).length;
}

export function hasPeriodicImageAtoms(scene: SceneSpec | null): boolean {
  return countPeriodicImageAtoms(scene) > 0;
}

export function visibleSceneForComponents(
  scene: SceneSpec | null,
  visibility: ComponentVisibilityState,
): SceneSpec | null {
  if (!scene) {
    return scene;
  }

  const atoms = scene.atoms.filter((atom) => isAtomAvailable(atom, visibility));
  const visibleAtomIds = new Set(atoms.map((atom) => atom.id));
  const bonds = visibility.bonds
    ? scene.bonds.filter((bond) => isBondAvailable(bond, visibleAtomIds))
    : [];

  return {
    ...scene,
    atoms,
    bonds,
  };
}

export function previewSafeAreaForSettings(): PreviewSafeArea {
  return SETTINGS_PREVIEW_SAFE_AREA;
}

function isAtomAvailable(atom: AtomSpec, visibility: ComponentVisibilityState): boolean {
  if (!atom.isPeriodicImage) {
    return true;
  }

  return dependencyGroupsAllow(atom.visibilityDependencyGroups, visibility);
}

function isBondAvailable(
  bond: BondSpec,
  visibleAtomIds: Set<string>,
): boolean {
  return (
    visibleAtomIds.has(bond.startAtomId) &&
    visibleAtomIds.has(bond.endAtomId)
  );
}

function dependencyGroupsAllow(
  dependencyGroups: VisibilityDependency[][],
  visibility: ComponentVisibilityState,
): boolean {
  if (dependencyGroups.length === 0) {
    return true;
  }

  return dependencyGroups.some((dependencyGroup) =>
    dependencyGroup.every((dependency) => dependencyEnabled(dependency, visibility)),
  );
}

function dependencyEnabled(
  dependency: VisibilityDependency,
  visibility: ComponentVisibilityState,
): boolean {
  if (dependency === "boundaryAtoms") {
    return visibility.boundaryAtoms;
  }

  return visibility.oneHopBondedAtoms;
}
