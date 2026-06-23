import { describe, expect, test } from "bun:test";

import type { SceneSpec } from "../src/api/scene";
import {
  SETTINGS_PREVIEW_SAFE_AREA,
  countPeriodicImageAtoms,
  hasPeriodicImageAtoms,
  previewSafeAreaForSettings,
  visibleSceneForBoundaryAtoms,
} from "../src/app/settings";

describe("settings", () => {
  test("detects periodic image atoms", () => {
    const scene = sceneWithPeriodicImages();

    expect(countPeriodicImageAtoms(scene)).toBe(2);
    expect(hasPeriodicImageAtoms(scene)).toBe(true);
    expect(countPeriodicImageAtoms(null)).toBe(0);
    expect(hasPeriodicImageAtoms(null)).toBe(false);
  });

  test("filters boundary atom images locally without mutating the loaded scene", () => {
    const scene = sceneWithPeriodicImages();

    expect(visibleSceneForBoundaryAtoms(scene, true)).toBe(scene);

    const filteredScene = visibleSceneForBoundaryAtoms(scene, false);

    expect(filteredScene).not.toBe(scene);
    expect(filteredScene?.atoms.map((atom) => atom.id)).toEqual(["Na-0", "Cl-1"]);
    expect(scene.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
      "Cl-1-image-1-0-0",
    ]);
  });

  test("uses a stable right safe area regardless of drawer state", () => {
    const safeArea = previewSafeAreaForSettings();

    expect(safeArea).toBe(SETTINGS_PREVIEW_SAFE_AREA);
    expect(safeArea.right).toBe(176);
    expect(safeArea.left).toBe(420);
    expect(safeArea.bottom).toBe(132);
  });
});

function sceneWithPeriodicImages(): SceneSpec {
  return {
    atoms: [
      atom("Na-0", "Na", false),
      atom("Na-0-image-1-0-0", "Na", true),
      atom("Cl-1", "Cl", false),
      atom("Cl-1-image-1-0-0", "Cl", true),
    ],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      atomCount: 2,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "NaCl",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}

function atom(id: string, element: string, isPeriodicImage: boolean) {
  return {
    color: element === "Na" ? "#fadd3d" : "#1ff01f",
    element,
    fractionalPosition: isPeriodicImage ? [1, 0, 0] : [0, 0, 0],
    id,
    imageOffset: isPeriodicImage ? [1, 0, 0] : [0, 0, 0],
    isPeriodicImage,
    position: isPeriodicImage ? [1, 0, 0] : [0, 0, 0],
    radius: 0.5,
    siteId: id.replace("-image-1-0-0", ""),
  } as const;
}
