import type { SceneSpec } from "../api/scene";
import type { PreviewSafeArea } from "../scene/LatticeScene";

export const SETTINGS_PREVIEW_SAFE_AREA: PreviewSafeArea = {
  bottom: 132,
  left: 380,
  right: 176,
  top: 24,
};

export function countPeriodicImageAtoms(scene: SceneSpec | null): number {
  if (!scene) {
    return 0;
  }

  return scene.atoms.filter((atom) => atom.isPeriodicImage).length;
}

export function hasPeriodicImageAtoms(scene: SceneSpec | null): boolean {
  return countPeriodicImageAtoms(scene) > 0;
}

export function visibleSceneForBoundaryAtoms(
  scene: SceneSpec | null,
  showBoundaryAtoms: boolean,
): SceneSpec | null {
  if (!scene || showBoundaryAtoms) {
    return scene;
  }

  const atoms = scene.atoms.filter((atom) => !atom.isPeriodicImage);
  if (atoms.length === scene.atoms.length) {
    return scene;
  }

  return {
    ...scene,
    atoms,
  };
}

export function previewSafeAreaForSettings(): PreviewSafeArea {
  return SETTINGS_PREVIEW_SAFE_AREA;
}
