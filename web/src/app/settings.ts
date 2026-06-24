import type {
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
  VisibilityDependency,
} from "../api/scene";
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
  polyhedra: boolean;
  boundaryAtoms: boolean;
  oneHopBondedAtoms: boolean;
}

export const DEFAULT_COMPONENT_VISIBILITY: ComponentVisibilityState = {
  atoms: true,
  unitCell: true,
  bonds: true,
  polyhedra: false,
  boundaryAtoms: true,
  oneHopBondedAtoms: false,
};

export interface ComponentOpacityState {
  atoms: number;
  unitCell: number;
  bonds: number;
  polyhedra: number;
}

export const DEFAULT_COMPONENT_OPACITY: ComponentOpacityState = {
  atoms: 100,
  unitCell: 100,
  bonds: 80,
  polyhedra: 25,
};

export const COMPONENT_OPACITY_MAX: ComponentOpacityState = {
  atoms: 100,
  unitCell: 100,
  bonds: 100,
  polyhedra: 50,
};

export interface StyleScaleState {
  atomRadius: number;
  bondThickness: number;
}

export const DEFAULT_STYLE_SCALE: StyleScaleState = {
  atomRadius: 100,
  bondThickness: 100,
};

export const STYLE_SCALE_MIN: StyleScaleState = {
  atomRadius: 50,
  bondThickness: 50,
};

export const STYLE_SCALE_MAX: StyleScaleState = {
  atomRadius: 200,
  bondThickness: 200,
};

export function createDefaultComponentVisibility(
  _scene: SceneSpec | null = null,
): ComponentVisibilityState {
  return { ...DEFAULT_COMPONENT_VISIBILITY };
}

export function createDefaultComponentOpacity(): ComponentOpacityState {
  return { ...DEFAULT_COMPONENT_OPACITY };
}

export function createDefaultStyleScale(): StyleScaleState {
  return { ...DEFAULT_STYLE_SCALE };
}

export function componentOpacityEquals(
  firstOpacity: ComponentOpacityState,
  secondOpacity: ComponentOpacityState,
): boolean {
  return (
    firstOpacity.atoms === secondOpacity.atoms &&
    firstOpacity.unitCell === secondOpacity.unitCell &&
    firstOpacity.bonds === secondOpacity.bonds &&
    firstOpacity.polyhedra === secondOpacity.polyhedra
  );
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

export function hasPolyhedra(scene: SceneSpec | null): boolean {
  return (scene?.polyhedra.length ?? 0) > 0;
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
  const polyhedra = visibility.polyhedra
    ? scene.polyhedra.filter((polyhedron) => isPolyhedronAvailable(polyhedron, visibleAtomIds))
    : [];

  return {
    ...scene,
    atoms,
    bonds,
    polyhedra,
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

function isPolyhedronAvailable(
  polyhedron: PolyhedronSpec,
  visibleAtomIds: Set<string>,
): boolean {
  return polyhedron.hullAtomIds.every((atomId) => visibleAtomIds.has(atomId));
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
