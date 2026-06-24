import { describe, expect, test } from "bun:test";

import type { SceneSpec } from "../src/api/scene";
import { deriveElementLegendEntries } from "../src/app/elementLegend";

describe("deriveElementLegendEntries", () => {
  test("keeps unique elements in first-seen order", () => {
    expect(
      deriveElementLegendEntries(
        sceneWithAtoms([
          { element: "Na", color: "#fadd3d" },
          { element: "Cl", color: "#1ff01f" },
          { element: "Na", color: "#000000" },
          { element: "O", color: "#ff0300" },
        ]),
      ),
    ).toEqual([
      { color: "#fadd3d", element: "Na" },
      { color: "#1ff01f", element: "Cl" },
      { color: "#ff0300", element: "O" },
    ]);
  });

  test("returns no legend entries without a loaded scene", () => {
    expect(deriveElementLegendEntries(null)).toEqual([]);
  });

  test("returns no legend entries for a scene without atoms", () => {
    expect(deriveElementLegendEntries(sceneWithAtoms([]))).toEqual([]);
  });

  test("derives entries from canonical atoms instead of periodic images", () => {
    expect(
      deriveElementLegendEntries(
        sceneWithAtoms([
          { element: "Na", color: "#000000", isPeriodicImage: true },
          { element: "Na", color: "#fadd3d" },
          { element: "Cl", color: "#1ff01f", isPeriodicImage: true },
          { element: "Cl", color: "#7aff7a" },
        ]),
      ),
    ).toEqual([
      { color: "#fadd3d", element: "Na" },
      { color: "#7aff7a", element: "Cl" },
    ]);
  });
});

interface TestAtom {
  color: string;
  element: string;
  isPeriodicImage?: boolean;
}

function sceneWithAtoms(atoms: TestAtom[]): SceneSpec {
  return {
    atoms: atoms.map(({ color, element, isPeriodicImage = false }, index) => ({
      color,
      element,
      id: `${element}-${index}`,
      siteId: `${element}-${index}`,
      position: [index, 0, 0],
      fractionalPosition: [index, 0, 0],
      imageOffset: isPeriodicImage ? [1, 0, 0] : [0, 0, 0],
      isPeriodicImage,
      imageReasons: isPeriodicImage ? ["boundary"] : [],
      visibilityDependencies: isPeriodicImage ? ["boundaryAtoms"] : [],
      visibilityDependencyGroups: isPeriodicImage ? [["boundaryAtoms"]] : [],
      radius: 1,
    })),
    bonds: [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      atomCount: atoms.length,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "-",
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
